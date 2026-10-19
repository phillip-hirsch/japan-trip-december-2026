// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import {
  useActivityEdit,
  useActivityMove,
  useActivityRemoval,
  useNewActivity,
} from '@/components/activities'
import {
  AddActivityOutcome,
  EditActivityOutcome,
  IsoDate,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  ScheduleId,
  TokyoDateTime,
} from '@/trip/domain/domain'
import type { Activity } from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  notSavedProblem,
  openEditor,
} from '@/trip/client/editor-testing'
import {
  addActivity,
  editActivity,
  moveActivity,
  removeActivity,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  addActivity: vi.fn(),
  editActivity: vi.fn(),
  moveActivity: vi.fn(),
  removeActivity: vi.fn(),
}))

const scheduleA = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const scheduleB = ScheduleId.make('00000000-0000-4000-8000-00000000000b')

const date = IsoDate.make('2026-12-07')

const scheduleChanged =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

describe('adding an Activity', () => {
  /** The new Activity editor on December 7, on a page showing `scheduleId`. */
  const openNewActivity = (scheduleId: ScheduleId) =>
    openEditor(
      ({ scheduleId }: { scheduleId: ScheduleId }) =>
        useNewActivity({ scheduleId, date }),
      { scheduleId },
    )

  /**
   * The Activity Tsukiji answered as added only when it is sent, under the
   * operation `operationId`, to December 7 of `scheduleId`.
   */
  const addedOnlyAs = (
    operationId: string,
    scheduleId: ScheduleId,
    fields: { readonly time?: string; readonly note?: string } = {},
  ) =>
    vi.mocked(addActivity).mockImplementation(
      answeringOnly(
        { operationId, scheduleId, date, title: 'Tsukiji', ...fields },
        AddActivityOutcome.cases.Added.make({
          activityId: 'activity-tsukiji',
        }),
        AddActivityOutcome.cases.ScheduleChanged.make({}),
      ),
    )

  const added = SaveState.Clean({ justSaved: true })

  it('adds the Activity to its Day of the Schedule shown, with its time and note', async () => {
    localStorage.clear()
    const editor = await openNewActivity(scheduleA)

    await act(async () =>
      editor.field().change({
        ...editor.field().value,
        title: 'Tsukiji',
        time: '06:30',
        note: 'Tuna auction.',
      }),
    )
    addedOnlyAs(editor.field().value.operationId, scheduleA, {
      time: '06:30',
      note: 'Tuna auction.',
    })
    await act(() => editor.field().save())

    assert.deepStrictEqual(editor.field().state, added)
    await editor.close()
  })

  it('keeps a Draft typed for a replaced Schedule marked "Schedule changed" across a reload, and adds it to the Schedule shown under a fresh operation', async () => {
    localStorage.clear()
    const before = await openNewActivity(scheduleA)
    await act(async () =>
      before.field().change({ ...before.field().value, title: 'Tsukiji' }),
    )
    const firstOperation = before.field().value.operationId

    await before.show({ scheduleId: scheduleB })
    assert.strictEqual(notSavedProblem(before.field().state), scheduleChanged)
    await before.close()

    const after = await openNewActivity(scheduleB)
    assert.strictEqual(notSavedProblem(after.field().state), scheduleChanged)
    assert.strictEqual(after.field().value.title, 'Tsukiji')
    const freshOperation = after.field().value.operationId
    assert.notStrictEqual(freshOperation, firstOperation)

    addedOnlyAs(freshOperation, scheduleB)
    await act(() => after.field().save())
    assert.deepStrictEqual(after.field().state, added)
    await after.close()
  })

  it('keeps a title that is too long marked "not saved", saying how long it can be', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockResolvedValue(
      AddActivityOutcome.cases.ActivityTitleInvalid.make({ maxLength: 200 }),
    )
    const editor = await openNewActivity(scheduleA)

    await act(async () =>
      editor.field().change({ ...editor.field().value, title: 'Tsukiji' }),
    )
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'An Activity needs a title, at most 200 characters.',
    )
    await editor.close()
  })
})

describe('editing an Activity', () => {
  const tsukiji: Activity = {
    id: 'activity-tsukiji',
    title: 'Tsukiji',
    time: TokyoDateTime.make('2026-12-07T06:30:00.000+09:00[Asia/Tokyo]'),
  }

  /** The editor of the Tsukiji Activity, read with `read`. */
  const openActivityEdit = (read?: () => Promise<string>) =>
    openEditor(
      () => useActivityEdit({ scheduleId: scheduleA, activity: tsukiji }),
      {},
      read,
    )

  it('sends only the fields changed, and an emptied time as none', async () => {
    localStorage.clear()
    vi.mocked(editActivity).mockImplementation(
      answeringOnly(
        {
          scheduleId: scheduleA,
          activityId: 'activity-tsukiji',
          time: null,
          note: 'Tuna auction.',
        },
        EditActivityOutcome.cases.Edited.make({}),
        EditActivityOutcome.cases.ScheduleChanged.make({}),
      ),
    )
    const editor = await openActivityEdit()

    await act(async () =>
      editor
        .field()
        .change({ ...editor.field().value, time: '', note: 'Tuna auction.' }),
    )
    await act(() => editor.field().save())

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('sends a title changed back when edited again before the read that shows the first edit', async () => {
    localStorage.clear()
    let reads = 0

    const editor = await openActivityEdit(() =>
      reads++ === 0
        ? Promise.resolve('schedules')
        : Promise.reject(new Error('offline')),
    )

    vi.mocked(editActivity).mockResolvedValueOnce(
      EditActivityOutcome.cases.Edited.make({}),
    )
    await act(async () =>
      editor.field().change({ ...editor.field().value, title: 'Toyosu' }),
    )
    await act(() => editor.field().save())

    vi.mocked(editActivity).mockImplementation(
      answeringOnly(
        {
          scheduleId: scheduleA,
          activityId: 'activity-tsukiji',
          title: 'Tsukiji',
        },
        EditActivityOutcome.cases.Edited.make({}),
        EditActivityOutcome.cases.ScheduleChanged.make({}),
      ),
    )
    await act(async () => editor.field().edit())
    await act(async () =>
      editor.field().change({ ...editor.field().value, title: 'Tsukiji' }),
    )
    await act(() => editor.field().save())

    assert.isTrue(SaveState.$is('Saved')(editor.field().state))
    await editor.close()
  })

  it('keeps the Draft for an Activity that no longer exists marked "not saved", says it is gone, and refetches', async () => {
    localStorage.clear()
    vi.mocked(editActivity).mockResolvedValue(
      EditActivityOutcome.cases.ActivityNotFound.make({
        activityId: 'activity-tsukiji',
      }),
    )
    let reads = 0
    const read = async () => `schedules, read ${++reads}`
    const editor = await openActivityEdit(read)

    await act(async () =>
      editor.field().change({ ...editor.field().value, title: 'Toyosu' }),
    )
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'This Activity is no longer on this Day, perhaps removed on another device.',
    )
    assert.strictEqual(editor.field().value.title, 'Toyosu')
    assert.strictEqual(editor.schedulesShown(), 'schedules, read 2')
    await editor.close()

    const reopened = await openActivityEdit(read)
    assert.isTrue(SaveState.$is('NotSaved')(reopened.field().state))
    assert.strictEqual(reopened.field().value.title, 'Toyosu')
    await reopened.close()
  })
})

describe('moving an Activity', () => {
  const openMove = () =>
    openEditor(() => useActivityMove({ scheduleId: scheduleA }), {})

  const moveTsukiji = {
    activityId: 'activity-tsukiji',
    before: 'activity-sushi',
  }

  it('moves the Activity before another on its Day of the Schedule shown', async () => {
    vi.mocked(moveActivity).mockImplementation(
      answeringOnly(
        { scheduleId: scheduleA, ...moveTsukiji },
        MoveActivityOutcome.cases.Moved.make({}),
        MoveActivityOutcome.cases.ScheduleChanged.make({}),
      ),
    )
    const editor = await openMove()

    await act(() => editor.field().send(moveTsukiji))

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('counts the move as saved when the Activity it was moving past is gone', async () => {
    vi.mocked(moveActivity).mockResolvedValue(
      MoveActivityOutcome.cases.ActivityNotFound.make({
        activityId: 'activity-sushi',
      }),
    )
    const editor = await openMove()

    await act(() => editor.field().send(moveTsukiji))

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a move of an Activity that no longer exists marked "not saved", saying it is gone', async () => {
    vi.mocked(moveActivity).mockResolvedValue(
      MoveActivityOutcome.cases.ActivityNotFound.make({
        activityId: 'activity-tsukiji',
      }),
    )
    const editor = await openMove()

    await act(() => editor.field().send(moveTsukiji))

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'This Activity is no longer on this Day, perhaps removed on another device.',
    )
    await editor.close()
  })
})

describe('removing an Activity', () => {
  const openRemoval = () =>
    openEditor(() => useActivityRemoval({ scheduleId: scheduleA }), {})

  it('removes the Activity from the Schedule shown', async () => {
    vi.mocked(removeActivity).mockImplementation(
      answeringOnly(
        { scheduleId: scheduleA, activityId: 'activity-tsukiji' },
        RemoveActivityOutcome.cases.Removed.make({}),
        RemoveActivityOutcome.cases.ScheduleChanged.make({}),
      ),
    )
    const editor = await openRemoval()

    await act(() => editor.field().send('activity-tsukiji'))

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('counts removing an Activity already gone as saved', async () => {
    vi.mocked(removeActivity).mockResolvedValue(
      RemoveActivityOutcome.cases.ActivityNotFound.make({
        activityId: 'activity-tsukiji',
      }),
    )
    const editor = await openRemoval()

    await act(() => editor.field().send('activity-tsukiji'))

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })
})
