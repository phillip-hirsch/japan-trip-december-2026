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
  useOperationSave,
} from '@/trip/client/drafts'
import { notSavedProblem, openEditor } from '@/trip/client/editor-testing'

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
