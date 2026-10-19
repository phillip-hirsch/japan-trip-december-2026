// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useDayNote, useStayNote, useTripNote } from '@/components/notes'
import {
  IsoDate,
  ScheduleId,
  WriteDayNoteOutcome,
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
} from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  deferred,
  notSavedProblem,
  openEditor,
  startSaving,
} from '@/trip/client/editor-testing'
import {
  writeDayNote,
  writeStayNote,
  writeTripNote,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  writeDayNote: vi.fn(),
  writeStayNote: vi.fn(),
  writeTripNote: vi.fn(),
}))

const scheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const date = IsoDate.make('2026-12-07')

/** Types `note` into the editor's field and presses Save, awaiting the answer. */
const typeAndSave = async (
  field: () => {
    change: (note: string) => void
    save: () => Promise<void>
  },
  note: string,
) => {
  await act(async () => field().change(note))
  await act(() => field().save())
}

describe('the Day note', () => {
  const openDayNote = (read?: () => Promise<string>) =>
    openEditor(
      () => useDayNote({ scheduleId, date, note: undefined }),
      {},
      read,
    )

  it('is saved once it sends the note to its Day of the Schedule shown', async () => {
    localStorage.clear()
    vi.mocked(writeDayNote).mockImplementation(
      answeringOnly(
        { scheduleId, date, note: 'Tsukiji at dawn.' },
        WriteDayNoteOutcome.cases.Written.make({}),
        WriteDayNoteOutcome.cases.DayNotFound.make({ date }),
      ),
    )
    const editor = await openDayNote()

    await typeAndSave(editor.field, 'Tsukiji at dawn.')

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a note that is too long marked "not saved", saying how long a Day note can be', async () => {
    localStorage.clear()
    vi.mocked(writeDayNote).mockResolvedValue(
      WriteDayNoteOutcome.cases.NoteTooLong.make({ maxLength: 10_000 }),
    )
    const editor = await openDayNote()

    await typeAndSave(editor.field, 'Tsukiji at dawn.')

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'A Day note can be at most 10,000 characters.',
    )
    await editor.close()
  })

  it('keeps the Draft for a Day that no longer exists marked "not saved", says it is gone, and refetches', async () => {
    localStorage.clear()
    vi.mocked(writeDayNote).mockResolvedValue(
      WriteDayNoteOutcome.cases.DayNotFound.make({ date }),
    )
    let reads = 0
    const read = async () => `schedules, read ${++reads}`
    const editor = await openDayNote(read)

    await typeAndSave(editor.field, 'Tsukiji at dawn.')

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'Monday, December 7 is no longer a Day of your Schedule, perhaps changed on another device.',
    )
    assert.strictEqual(editor.field().value, 'Tsukiji at dawn.')
    assert.strictEqual(editor.schedulesShown(), 'schedules, read 2')
    await editor.close()

    const reopened = await openDayNote(read)
    assert.isTrue(SaveState.$is('NotSaved')(reopened.field().state))
    assert.strictEqual(reopened.field().value, 'Tsukiji at dawn.')
    await reopened.close()
  })
  describe('moving to another Day in the same editor', () => {
    const december8 = IsoDate.make('2026-12-08')

    interface DayShown {
      readonly date: IsoDate
      readonly note: string | undefined
    }

    const december7: DayShown = { date, note: undefined }

    const openOnDecember7 = () =>
      openEditor(
        (shown: DayShown) => useDayNote({ scheduleId, ...shown }),
        december7,
      )

    it('starts afresh on the other Day, and restores the first Day’s Draft on returning', async () => {
      localStorage.clear()
      const editor = await openOnDecember7()
      await act(async () => editor.field().change('Tsukiji at dawn.'))

      await editor.show({ date: december8, note: undefined })
      assert.deepStrictEqual(
        { state: editor.field().state, value: editor.field().value },
        { state: SaveState.Clean({ justSaved: false }), value: '' },
      )

      await editor.show({ date, note: undefined })
      assert.deepStrictEqual(
        {
          problem: notSavedProblem(editor.field().state),
          value: editor.field().value,
        },
        {
          problem:
            'This is what you typed here last time. Save it, or discard it.',
          value: 'Tsukiji at dawn.',
        },
      )
      await editor.close()
    })

    it('leaves the other Day’s note as it is when the first Day’s save is answered after moving', async () => {
      localStorage.clear()
      const answer = deferred<WriteDayNoteOutcome>()
      vi.mocked(writeDayNote).mockReturnValue(answer.promise)
      const editor = await openOnDecember7()
      await act(async () => editor.field().change('Tsukiji at dawn.'))
      const { finished } = await startSaving(() => editor.field().save())

      await editor.show({ date: december8, note: 'Nara deer.' })
      await act(async () => {
        answer.resolve(
          WriteDayNoteOutcome.cases.NoteTooLong.make({ maxLength: 10 }),
        )
        await finished
      })

      assert.deepStrictEqual(
        { state: editor.field().state, value: editor.field().value },
        { state: SaveState.Clean({ justSaved: false }), value: 'Nara deer.' },
      )
      await editor.close()
    })
  })
})

describe('the Stay note', () => {
  const openStayNote = (read?: () => Promise<string>) =>
    openEditor(
      () => useStayNote({ scheduleId, stayId: 'stay-kyoto', note: undefined }),
      {},
      read,
    )

  it('is saved once it sends the note to its Stay of the Schedule shown', async () => {
    localStorage.clear()
    vi.mocked(writeStayNote).mockImplementation(
      answeringOnly(
        { scheduleId, stayId: 'stay-kyoto', note: 'Near Gion.' },
        WriteStayNoteOutcome.cases.Written.make({}),
        WriteStayNoteOutcome.cases.StayNotFound.make({ stayId: 'stay-kyoto' }),
      ),
    )
    const editor = await openStayNote()

    await typeAndSave(editor.field, 'Near Gion.')

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a note that is too long marked "not saved", saying how long a Stay note can be', async () => {
    localStorage.clear()
    vi.mocked(writeStayNote).mockResolvedValue(
      WriteStayNoteOutcome.cases.NoteTooLong.make({ maxLength: 10_000 }),
    )
    const editor = await openStayNote()

    await typeAndSave(editor.field, 'Near Gion.')

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'A Stay note can be at most 10,000 characters.',
    )
    await editor.close()
  })

  it('keeps the Draft for a Stay that no longer exists marked "not saved", says it is gone, and refetches', async () => {
    localStorage.clear()
    vi.mocked(writeStayNote).mockResolvedValue(
      WriteStayNoteOutcome.cases.StayNotFound.make({ stayId: 'stay-kyoto' }),
    )
    let reads = 0
    const read = async () => `schedules, read ${++reads}`
    const editor = await openStayNote(read)

    await typeAndSave(editor.field, 'Near Gion.')

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'This Stay is no longer part of your Schedule, perhaps changed on another device.',
    )
    assert.strictEqual(editor.field().value, 'Near Gion.')
    assert.strictEqual(editor.schedulesShown(), 'schedules, read 2')
    await editor.close()

    const reopened = await openStayNote(read)
    assert.isTrue(SaveState.$is('NotSaved')(reopened.field().state))
    assert.strictEqual(reopened.field().value, 'Near Gion.')
    await reopened.close()
  })
})

describe('the Trip note', () => {
  /** The Trip note's editor, saved as "Pack light.", with its Schedules read with `read`. */
  const openTripNote = (
    read: () => Promise<string> = async () => 'schedules',
  ) => openEditor(() => useTripNote({ note: 'Pack light.' }), {}, read)

  /** Types `note` and presses Save, before its answer comes. */
  const startSave = async (
    editor: Awaited<ReturnType<typeof openTripNote>>,
    note: string,
  ) => {
    await act(async () => editor.field().change(note))

    return startSaving(() => editor.field().save())
  }

  it('is saved once it sends the note to the Trip, naming no Schedule', async () => {
    localStorage.clear()
    vi.mocked(writeTripNote).mockImplementation(
      answeringOnly(
        { note: 'Pack lighter.' },
        WriteTripNoteOutcome.cases.Written.make({}),
        WriteTripNoteOutcome.cases.NoteTooLong.make({ maxLength: 10_000 }),
      ),
    )
    const editor = await openTripNote()

    await typeAndSave(editor.field, 'Pack lighter.')

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a note that is too long marked "not saved", saying how long a Trip note can be', async () => {
    localStorage.clear()
    vi.mocked(writeTripNote).mockResolvedValue(
      WriteTripNoteOutcome.cases.NoteTooLong.make({ maxLength: 10_000 }),
    )
    const editor = await openTripNote()

    await typeAndSave(editor.field, 'Pack lighter.')

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'A Trip note can be at most 10,000 characters.',
    )
    await editor.close()
  })

  it('leaves nothing listening for reads when the save lands after its editor closed', async () => {
    localStorage.clear()
    const answer = deferred<WriteTripNoteOutcome>()
    vi.mocked(writeTripNote).mockReturnValue(answer.promise)
    const editor = await openTripNote()

    const { finished } = await startSave(editor, 'Pack lighter.')
    await editor.close()

    await act(async () => {
      answer.resolve(WriteTripNoteOutcome.cases.Written.make({}))
      await finished
    })

    assert.isFalse(editor.listening())
    assert.isTrue(editor.schedulesRefreshDue())
  })

  it('shows Saved, then Clean once a read confirms it, while its editor stays open', async () => {
    localStorage.clear()
    vi.mocked(writeTripNote).mockResolvedValue(
      WriteTripNoteOutcome.cases.Written.make({}),
    )
    const reread = deferred<string>()
    let reads = 0

    const editor = await openTripNote(() =>
      reads++ === 0 ? Promise.resolve('schedules') : reread.promise,
    )

    const { finished } = await startSave(editor, 'Pack lighter.')
    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Saved({ value: 'Pack lighter.' }),
    )

    await act(async () => {
      reread.resolve('schedules, re-read')
      await finished
    })

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    assert.isFalse(editor.listening())
    await editor.close()
  })

  it('stops waiting for the read when its editor closes after the save landed', async () => {
    localStorage.clear()
    vi.mocked(writeTripNote).mockResolvedValue(
      WriteTripNoteOutcome.cases.Written.make({}),
    )
    const reread = deferred<string>()
    let reads = 0

    const editor = await openTripNote(() =>
      reads++ === 0 ? Promise.resolve('schedules') : reread.promise,
    )

    const { finished } = await startSave(editor, 'Pack lighter.')
    assert.isTrue(editor.listening())
    await editor.close()
    assert.isFalse(editor.listening())

    await act(async () => {
      reread.resolve('schedules, re-read')
      await finished
    })
  })
})
