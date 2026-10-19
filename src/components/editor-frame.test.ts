// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useNewActivity } from '@/components/activities'
import { useNewChecklistItem, useTick } from '@/components/checklist'
import { addVerb, useEditorFrame } from '@/components/editor-frame'
import { useDayNote } from '@/components/notes'
import {
  AddActivityOutcome,
  ChecklistItem,
  IsoDate,
  ScheduleId,
  TickOwnChecklistItemOutcome,
  WriteDayNoteOutcome,
} from '@/trip/domain/domain'
import { SaveAnswer, useOfferedSave } from '@/trip/client/drafts'
import { deferred, openEditor, startSaving } from '@/trip/client/editor-testing'
import {
  addActivity,
  tickOwnChecklistItem,
  writeDayNote,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  addActivity: vi.fn(),
  addOwnChecklistItem: vi.fn(),
  tickChecklistItem: vi.fn(),
  tickOwnChecklistItem: vi.fn(),
  writeDayNote: vi.fn(),
}))

const scheduleA = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const scheduleB = ScheduleId.make('00000000-0000-4000-8000-00000000000b')

const date = IsoDate.make('2026-12-07')

const answerDayNote = (answer: () => Promise<WriteDayNoteOutcome>) =>
  vi.mocked(writeDayNote).mockImplementation(answer)

const written = async () => WriteDayNoteOutcome.cases.Written.make({})

/**
 * The Day note editor on December 7 of the Schedule shown, saved as `note`,
 * and its frame. The Schedules are read with `read`.
 */
const openDayNoteFrame = (
  read: () => Promise<string> = async () => 'schedules',
) =>
  openEditor(
    ({ scheduleId }: { scheduleId: ScheduleId }) => {
      const field = useDayNote({ scheduleId, date, note: 'Tsukiji at dawn.' })

      return { field, frame: useEditorFrame(field) }
    },
    { scheduleId: scheduleA },
    read,
  )

const restored =
  'This is what you typed here last time. Save it, or discard it.'

const scheduleChanged =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

describe('the editor frame', () => {
  it('shows a clean Day note as its saved summary', async () => {
    localStorage.clear()
    const editor = await openDayNoteFrame()

    const { view, justSaved } = editor.field().frame
    assert.deepStrictEqual(
      { view, justSaved },
      { view: 'summary', justSaved: false },
    )
    await editor.close()
  })

  it('opens the form focused to edit, offering Save and Cancel', async () => {
    localStorage.clear()
    const editor = await openDayNoteFrame()

    await act(async () => editor.field().field.edit())

    const { view, submitLabel, discardLabel, autoFocus, busy, problem } =
      editor.field().frame

    assert.deepStrictEqual(
      { view, submitLabel, discardLabel, autoFocus, busy, problem },
      {
        view: 'form',
        submitLabel: 'Save',
        discardLabel: 'Cancel',
        autoFocus: true,
        busy: false,
        problem: undefined,
      },
    )
    await editor.close()
  })

  it('holds the form busy, saying "Saving…", while the note is on its way', async () => {
    localStorage.clear()
    const answer = deferred<WriteDayNoteOutcome>()
    answerDayNote(() => answer.promise)
    const editor = await openDayNoteFrame()

    await act(async () => editor.field().field.change('Tsukiji at six.'))
    const { finished } = await startSaving(() => editor.field().field.save())

    const { view, submitLabel, busy, autoFocus } = editor.field().frame
    assert.deepStrictEqual(
      { view, submitLabel, busy, autoFocus },
      { view: 'form', submitLabel: 'Saving…', busy: true, autoFocus: false },
    )

    await act(async () => {
      answer.resolve(WriteDayNoteOutcome.cases.Written.make({}))
      await finished
    })
    await editor.close()
  })

  it('marks the summary just saved after a save, and still after the read that confirms it', async () => {
    localStorage.clear()
    answerDayNote(written)
    const reread = deferred<string>()
    let reads = 0

    const editor = await openDayNoteFrame(() =>
      reads++ === 0 ? Promise.resolve('schedules') : reread.promise,
    )

    await act(async () => editor.field().field.change('Tsukiji at six.'))
    const { finished } = await startSaving(() => editor.field().field.save())
    assert.strictEqual(editor.field().frame.view, 'summary')
    assert.isTrue(editor.field().frame.justSaved)

    await act(async () => {
      reread.resolve('schedules, re-read')
      await finished
    })
    assert.strictEqual(editor.field().frame.view, 'summary')
    assert.isTrue(editor.field().frame.justSaved)
    await editor.close()
  })

  it('lets a saved note be edited again even when the read that would confirm it fails', async () => {
    localStorage.clear()
    answerDayNote(written)
    let reads = 0

    const editor = await openDayNoteFrame(() =>
      reads++ === 0
        ? Promise.resolve('schedules')
        : Promise.reject(new Error('offline')),
    )

    await act(async () => editor.field().field.change('Tsukiji at six.'))
    await act(() => editor.field().field.save())

    const { view, justSaved, busy } = editor.field().frame
    assert.deepStrictEqual(
      { view, justSaved, busy },
      { view: 'summary', justSaved: true, busy: false },
    )
    await editor.close()
  })

  it('keeps a refused note in the form marked "not saved", offering Retry and Discard', async () => {
    localStorage.clear()
    answerDayNote(async () =>
      WriteDayNoteOutcome.cases.NoteTooLong.make({ maxLength: 10_000 }),
    )
    const editor = await openDayNoteFrame()

    await act(async () => editor.field().field.change('Tsukiji at six.'))
    await act(() => editor.field().field.save())

    const { view, submitLabel, discardLabel, problem, busy } =
      editor.field().frame

    assert.deepStrictEqual(
      { view, submitLabel, discardLabel, problem, busy },
      {
        view: 'form',
        submitLabel: 'Retry',
        discardLabel: 'Discard',
        problem: 'A Day note can be at most 10,000 characters.',
        busy: false,
      },
    )
    await editor.close()
  })

  it('opens a Draft restored from an earlier visit unfocused, marked "not saved"', async () => {
    localStorage.clear()
    const before = await openDayNoteFrame()
    await act(async () => before.field().field.edit())
    await act(async () => before.field().field.change('Tsukiji at six.'))
    await before.close()

    const after = await openDayNoteFrame()

    const { view, autoFocus, problem, submitLabel } = after.field().frame
    assert.deepStrictEqual(
      { view, autoFocus, problem, submitLabel },
      {
        view: 'form',
        autoFocus: false,
        problem: restored,
        submitLabel: 'Retry',
      },
    )
    await after.close()
  })

  it('marks a Draft "not saved" when the Schedule changed on another device', async () => {
    localStorage.clear()
    const editor = await openDayNoteFrame()
    await act(async () => editor.field().field.change('Tsukiji at six.'))

    await editor.show({ scheduleId: scheduleB })

    const { view, problem, submitLabel, discardLabel } = editor.field().frame
    assert.deepStrictEqual(
      { view, problem, submitLabel, discardLabel },
      {
        view: 'form',
        problem: scheduleChanged,
        submitLabel: 'Retry',
        discardLabel: 'Discard',
      },
    )
    await editor.close()
  })
})

describe('the editor frame of a new Activity', () => {
  it('holds the form open and busy until the read shows the Activity added, then marks it added', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockResolvedValue(
      AddActivityOutcome.cases.Added.make({ activityId: 'activity-tsukiji' }),
    )
    const reread = deferred<string>()
    let reads = 0

    const editor = await openEditor(
      () => {
        const field = useNewActivity({ scheduleId: scheduleA, date })

        return {
          field,
          frame: useEditorFrame(field, { verb: addVerb, form: 'untilShown' }),
        }
      },
      {},
      () => (reads++ === 0 ? Promise.resolve('schedules') : reread.promise),
    )

    await act(async () => editor.field().field.edit())
    await act(async () =>
      editor
        .field()
        .field.change({ ...editor.field().field.value, title: 'Tsukiji' }),
    )
    const { finished } = await startSaving(() => editor.field().field.save())

    const { view, busy, submitLabel } = editor.field().frame
    assert.deepStrictEqual(
      { view, busy, submitLabel },
      { view: 'form', busy: true, submitLabel: 'Add' },
    )

    await act(async () => {
      reread.resolve('schedules, re-read')
      await finished
    })
    const shown = editor.field().frame
    assert.deepStrictEqual(
      { view: shown.view, busy: shown.busy, justSaved: shown.justSaved },
      { view: 'summary', busy: false, justSaved: true },
    )
    await editor.close()
  })
})

describe('the editor frame of a new own Checklist item', () => {
  const openNewItemFrame = () =>
    openEditor(() => {
      const field = useNewChecklistItem()

      return {
        field,
        frame: useEditorFrame(field, { verb: addVerb, form: 'always' }),
      }
    }, {})

  it('keeps the form open, unfocused, with nothing to discard until something is typed', async () => {
    localStorage.clear()
    const editor = await openNewItemFrame()

    const { view, submitLabel, discardLabel, autoFocus } = editor.field().frame
    assert.deepStrictEqual(
      { view, submitLabel, discardLabel, autoFocus },
      {
        view: 'form',
        submitLabel: 'Add',
        discardLabel: undefined,
        autoFocus: false,
      },
    )

    await act(async () =>
      editor
        .field()
        .field.change({ ...editor.field().field.value, text: 'Buy a JR Pass' }),
    )
    assert.strictEqual(editor.field().frame.discardLabel, 'Cancel')
    await editor.close()
  })
})

describe('the editor frame of a Tick', () => {
  const item = ChecklistItem.cases.Own.make({
    id: 'item-jr-pass',
    ticked: false,
    text: 'Buy a JR Pass',
  })

  it('holds the Tick busy while it is on its way, then says why it wasn’t saved', async () => {
    const answer = deferred<TickOwnChecklistItemOutcome>()
    vi.mocked(tickOwnChecklistItem).mockReturnValue(answer.promise)

    const editor = await openEditor(() => {
      const field = useTick({ item, scheduleId: null })

      return { field, frame: useEditorFrame(field) }
    }, {})

    const { finished } = await startSaving(() =>
      editor.field().field.send(true),
    )

    assert.isTrue(editor.field().frame.busy)

    await act(async () => {
      answer.resolve(
        TickOwnChecklistItemOutcome.cases.ChecklistItemNotFound.make({
          itemId: 'item-jr-pass',
        }),
      )
      await finished
    })
    const { busy, problem } = editor.field().frame
    assert.deepStrictEqual(
      { busy, problem },
      {
        busy: false,
        problem:
          'This item is no longer on your Checklist, perhaps removed on another device.',
      },
    )
    await editor.close()
  })
})

describe('the editor frame of a Stay edit the Schedule withdraws', () => {
  const refusal =
    'Only Stays in the same Base can be merged. Nothing changed. Your Stays may have changed on another device.'

  /** "Merge with next Stay", offered while the next Stay is `next`. */
  const openMergeFrame = (
    next: string | undefined,
    answer: () => Promise<SaveAnswer>,
  ) =>
    openEditor(
      ({ next }: { next: string | undefined }) => {
        const field = useOfferedSave<string | null>({
          offered: (choice) =>
            choice === null ? next !== undefined : choice === next,
          scheduleId: scheduleA,
          saved: null,
          write: 'stayEdit',
          run: answer,
        })

        return { field, frame: useEditorFrame(field) }
      },
      { next },
    )

  it('shows an open edit as withdrawn, offering Cancel', async () => {
    const editor = await openMergeFrame('stay-osaka', async () =>
      SaveAnswer.Saved(),
    )

    await act(async () => editor.field().field.change('stay-osaka'))

    await editor.show({ next: undefined })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { view, discardLabel, problem },
      { view: 'withdrawn', discardLabel: 'Cancel', problem: undefined },
    )
    await editor.close()
  })

  it('shows a refused edit as withdrawn with its refusal, offering Discard', async () => {
    const editor = await openMergeFrame('stay-osaka', async () =>
      SaveAnswer.Gone({ problem: refusal }),
    )

    await act(async () => editor.field().field.change('stay-osaka'))
    await act(() => editor.field().field.save())

    await editor.show({ next: undefined })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { view, discardLabel, problem },
      { view: 'withdrawn', discardLabel: 'Discard', problem: refusal },
    )
    await editor.close()
  })
})
