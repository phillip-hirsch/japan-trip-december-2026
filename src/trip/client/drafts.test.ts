// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { Predicate } from 'effect'
import { act } from 'react'

import { EditActivityOutcome, IsoDate, ScheduleId } from '@/trip/domain/domain'
import {
  SaveAnswer,
  SaveState,
  activityTarget,
  newActivityTarget,
  useDraftedField,
  useOfferedSave,
  useOperationSave,
} from '@/trip/client/drafts'
import {
  deferred,
  notSavedProblem,
  openEditor,
  startSaving,
} from '@/trip/client/editor-testing'

// The server functions are the transport the Trip queries read through; the
// editor here sends with its own `run` and reads with its own `queryFn`.
vi.mock('@/trip/trip/trip.functions', () => ({}))

interface NewActivity {
  readonly title: string
  readonly operationId: string
  readonly operationScheduleId: string
}

interface AddSent {
  readonly operationId: string
  readonly operationScheduleId: string
  readonly scheduleId: ScheduleId
}

/**
 * The New Activity editor on a Day, open on a page showing `scheduleId`.
 * Each add it sends is recorded in `sent`: its operation, the Schedule that
 * operation was made for, and the Schedule shown then, which it is sent to.
 */
const openNewActivityEditor = async (
  scheduleId: ScheduleId,
  sent: Array<AddSent>,
) => {
  const editor = await openEditor(
    ({ scheduleId }: { scheduleId: ScheduleId }) =>
      useOperationSave<NewActivity>({
        draft: {
          target: newActivityTarget(IsoDate.make('2026-12-07')),
          isValue: (value): value is NewActivity =>
            Predicate.isObject(value) &&
            Predicate.isString(value.title) &&
            Predicate.isString(value.operationId) &&
            Predicate.isString(value.operationScheduleId),
        },
        equals: (a, b) => a.title === b.title,
        scheduleId,
        saved: { title: '', operationId: '', operationScheduleId: '' },
        write: 'activity',
        run: async ({ operationId, operationScheduleId }) => {
          sent.push({ operationId, operationScheduleId, scheduleId })

          return SaveAnswer.Saved()
        },
      }),
    { scheduleId },
  )

  return {
    ...editor,
    /** The page now shows another Schedule, as after choosing again. */
    showSchedule: (next: ScheduleId) => editor.show({ scheduleId: next }),
  }
}

/**
 * The "Merge with next Stay" Stay edit on a Kyoto Stay, open on a page whose
 * Schedule offers a merge with the Stay `next`, or none. Each merge it sends
 * is recorded in `sent`, and answered with `answer`.
 */
const openMergeEditor = async (
  next: string | undefined,
  sent: Array<string>,
  answer: () => Promise<SaveAnswer>,
) => {
  const editor = await openEditor(
    ({ next }: { next: string | undefined }) =>
      useOfferedSave<string | null>({
        offered: (choice) =>
          choice === null ? next !== undefined : choice === next,
        scheduleId: ScheduleId.make('00000000-0000-4000-8000-00000000000a'),
        saved: null,
        write: 'stayEdit',
        run: async (choice) => {
          if (choice !== null) sent.push(choice)

          return answer()
        },
      }),
    { next },
  )

  return {
    ...editor,
    /** The page now shows the Schedule as another device left it. */
    refresh: (next: string | undefined) => editor.show({ next }),
  }
}

const scheduleChanged =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

describe('adding an Activity', () => {
  const scheduleA = ScheduleId.make('00000000-0000-4000-8000-00000000000a')
  const scheduleB = ScheduleId.make('00000000-0000-4000-8000-00000000000b')

  it('keeps a Draft typed for a replaced Schedule marked "Schedule changed" across a reload, and adds it once to the Schedule shown', async () => {
    localStorage.clear()
    const sent: Array<AddSent> = []

    const before = await openNewActivityEditor(scheduleA, sent)
    await act(async () =>
      before.field().change({ ...before.field().value, title: 'Tsukiji' }),
    )
    const firstOperation = before.field().value.operationId

    await before.showSchedule(scheduleB)
    assert.strictEqual(notSavedProblem(before.field().state), scheduleChanged)
    await before.close()

    const after = await openNewActivityEditor(scheduleB, sent)
    assert.strictEqual(notSavedProblem(after.field().state), scheduleChanged)
    assert.strictEqual(after.field().value.title, 'Tsukiji')

    await act(() => after.field().save())
    assert.strictEqual(sent.length, 1)
    assert.strictEqual(sent[0]?.scheduleId, scheduleB)
    assert.strictEqual(sent[0]?.operationScheduleId, scheduleB)
    assert.notStrictEqual(sent[0]?.operationId, firstOperation)
    await after.close()
  })
})

describe('a Stay edit the refreshed Schedule withdraws', () => {
  const refusal =
    'Only Stays in the same Base can be merged. Nothing changed. Your Stays may have changed on another device.'

  const refused = async () => SaveAnswer.Gone({ problem: refusal })

  it('keeps its Hard-rule refusal shown until discarded, and sends nothing on retry', async () => {
    const sent: Array<string> = []
    const editor = await openMergeEditor('stay-osaka', sent, refused)

    await act(async () => editor.field().change('stay-osaka'))
    await act(() => editor.field().save())
    assert.deepStrictEqual(sent, ['stay-osaka'])
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)

    await editor.refresh(undefined)
    assert.isTrue(editor.field().shown)
    assert.isTrue(editor.field().withdrawn)
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)

    await act(() => editor.field().save())
    assert.deepStrictEqual(sent, ['stay-osaka'])
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)

    await act(async () => editor.field().discard())
    assert.isFalse(editor.field().shown)
    await editor.close()
  })

  it('withdraws a chosen edit the Schedule no longer offers, and still offers the new one', async () => {
    const sent: Array<string> = []
    const editor = await openMergeEditor('stay-a', sent, refused)

    await act(async () => editor.field().change('stay-a'))
    await editor.refresh('stay-b')
    assert.isTrue(editor.field().withdrawn)
    await act(() => editor.field().save())
    assert.deepStrictEqual(sent, [])

    await act(async () => editor.field().discard())
    assert.isTrue(editor.field().shown)
    assert.isFalse(editor.field().withdrawn)
    await editor.close()
  })

  it('shows the refusal of a save the Schedule withdrew while it was on its way', async () => {
    const sent: Array<string> = []
    const answer = deferred<SaveAnswer>()

    const editor = await openMergeEditor(
      'stay-osaka',
      sent,
      () => answer.promise,
    )

    await act(async () => editor.field().change('stay-osaka'))
    const { finished } = await startSaving(() => editor.field().save())
    await editor.refresh(undefined)

    await act(async () => {
      answer.resolve(SaveAnswer.Gone({ problem: refusal }))
      await finished
    })

    assert.isTrue(editor.field().shown)
    assert.isTrue(editor.field().withdrawn)
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)
    await editor.close()
  })
})

// The note and Hotel details tests cover a gone Day or Stay.
describe('saving to an Activity that no longer exists', () => {
  const scheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

  it('keeps the Draft marked "not saved", says it is gone, and refetches', async () => {
    localStorage.clear()
    let reads = 0

    const open = () =>
      openEditor(
        () =>
          useDraftedField({
            target: activityTarget('activity-tsukiji'),
            scheduleId,
            saved: '',
            write: 'activity',
            run: async () =>
              EditActivityOutcome.cases.ActivityNotFound.make({
                activityId: 'activity-tsukiji',
              }),
          }),
        {},
        async () => `schedules, read ${++reads}`,
      )

    const editor = await open()
    await act(async () => editor.field().change('Tsukiji at dawn'))
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'This Activity is no longer on this Day, perhaps removed on another device.',
    )
    assert.strictEqual(editor.field().value, 'Tsukiji at dawn')
    assert.strictEqual(editor.schedulesShown(), 'schedules, read 2')
    await editor.close()

    const reopened = await open()
    assert.isTrue(SaveState.$is('NotSaved')(reopened.field().state))
    assert.strictEqual(reopened.field().value, 'Tsukiji at dawn')
    await reopened.close()
  })
})
