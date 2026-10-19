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
  answeringOnlyUnderAnyOperation,
  losingFirstAnswer,
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

  const tsukijiAdded = AddActivityOutcome.cases.Added.make({
    activityId: 'activity-tsukiji',
  })

  // Stands for any answer but Added: the Activity would be added twice.
  const addedAgain = AddActivityOutcome.cases.ScheduleChanged.make({})

  const added = SaveState.Clean({ justSaved: true })

  const typeTsukiji = (field: () => ReturnType<typeof useNewActivity>) =>
    act(async () => field().change({ ...field().value, title: 'Tsukiji' }))

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
    vi.mocked(addActivity).mockImplementation(
      answeringOnlyUnderAnyOperation(
        {
          scheduleId: scheduleA,
          date,
          title: 'Tsukiji',
          time: '06:30',
          note: 'Tuna auction.',
        },
        tsukijiAdded,
        addedAgain,
      ),
    )
    await act(() => editor.field().save())

    assert.deepStrictEqual(editor.field().state, added)
    await editor.close()
  })

  it('adds the Activity once when Retry follows an add whose answer was lost', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockImplementation(
      losingFirstAnswer(
        (retry, first) => retry.operationId === first.operationId,
        tsukijiAdded,
        addedAgain,
      ),
    )
    const editor = await openNewActivity(scheduleA)

    await typeTsukiji(editor.field)
    await act(() => editor.field().save())
    await act(() => editor.field().save())

    assert.deepStrictEqual(editor.field().state, added)
    await editor.close()
  })

  it('keeps a Draft sent to a replaced Schedule marked "Schedule changed" across a reload, unsent until Retry, which adds it to the Schedule shown as a new operation', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockImplementation(
      losingFirstAnswer(
        (retry, first) =>
          retry.operationId !== first.operationId &&
          retry.scheduleId === scheduleB,
        tsukijiAdded,
        addedAgain,
      ),
    )
    const before = await openNewActivity(scheduleA)
    await typeTsukiji(before.field)
    await act(() => before.field().save())

    await before.show({ scheduleId: scheduleB })
    assert.strictEqual(notSavedProblem(before.field().state), scheduleChanged)
    await before.close()

    const after = await openNewActivity(scheduleB)
    assert.strictEqual(notSavedProblem(after.field().state), scheduleChanged)
    assert.strictEqual(after.field().value.title, 'Tsukiji')

    await act(() => after.field().save())
    assert.deepStrictEqual(after.field().state, added)
    await after.close()
  })

  it('keeps a Draft typed, never sent, for a replaced Schedule marked "Schedule changed" across a reload', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockImplementation(
      answeringOnlyUnderAnyOperation(
        { scheduleId: scheduleB, date, title: 'Tsukiji' },
        tsukijiAdded,
        addedAgain,
      ),
    )
    const before = await openNewActivity(scheduleA)
    await typeTsukiji(before.field)
    await before.show({ scheduleId: scheduleB })
    await before.close()

    const after = await openNewActivity(scheduleB)
    assert.strictEqual(notSavedProblem(after.field().state), scheduleChanged)

    await act(() => after.field().save())
    assert.deepStrictEqual(after.field().state, added)
    await after.close()
  })

  it('keeps a Draft from a replaced Schedule marked "Schedule changed" across a reload after its Retry got no answer, and retries it as the same operation', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockImplementation(
      losingFirstAnswer(
        (retry, first) =>
          retry.operationId === first.operationId &&
          retry.scheduleId === scheduleB,
        tsukijiAdded,
        addedAgain,
      ),
    )
    const before = await openNewActivity(scheduleA)
    await typeTsukiji(before.field)
    await before.show({ scheduleId: scheduleB })
    await act(() => before.field().save())
    await before.close()

    const after = await openNewActivity(scheduleB)
    assert.strictEqual(notSavedProblem(after.field().state), scheduleChanged)

    await act(() => after.field().save())
    assert.deepStrictEqual(after.field().state, added)
    await after.close()
  })

  it('retries a Draft kept by an earlier version of the app as the operation it was sent under', async () => {
    localStorage.clear()
    // How the app kept a new Activity's Draft before operations were stored
    // on their own.
    localStorage.setItem(
      'draft:activity:new:2026-12-07',
      JSON.stringify({
        value: {
          title: 'Tsukiji',
          time: '',
          note: '',
          operationId: 'operation-sent-before',
          operationScheduleId: scheduleA,
        },
        scheduleId: scheduleA,
        id: 'kept-before',
      }),
    )
    vi.mocked(addActivity).mockImplementation(
      answeringOnly(
        {
          operationId: 'operation-sent-before',
          scheduleId: scheduleA,
          date,
          title: 'Tsukiji',
        },
        tsukijiAdded,
        addedAgain,
      ),
    )
    const editor = await openNewActivity(scheduleA)

    await act(() => editor.field().save())

    assert.deepStrictEqual(editor.field().state, added)
    await editor.close()
  })

  it('keeps a title that is too long marked "not saved", saying how long it can be', async () => {
    localStorage.clear()
    vi.mocked(addActivity).mockResolvedValue(
      AddActivityOutcome.cases.ActivityTitleInvalid.make({ maxLength: 200 }),
    )
    const editor = await openNewActivity(scheduleA)

    await typeTsukiji(editor.field)
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

/** Activities on December 7 with these ids, as the Day last read shows them. */
const shownActivities = (...ids: ReadonlyArray<string>) =>
  ids.map((id): Activity => ({ id, title: id }))

const tsukijiAndSushi = shownActivities('activity-tsukiji', 'activity-sushi')

/** The Day shows these Activities. */
interface DayShows {
  readonly activities: ReadonlyArray<Activity>
}

describe('moving an Activity', () => {
  const openMove = () =>
    openEditor(
      ({ activities }: DayShows) =>
        useActivityMove({ scheduleId: scheduleA, date, activities }),
      { activities: tsukijiAndSushi },
    )

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
  it('drops a move not saved once the Day shows the Activity gone', async () => {
    vi.mocked(moveActivity).mockRejectedValue(new Error('offline'))
    const editor = await openMove()
    await act(() => editor.field().send(moveTsukiji))

    await editor.show({ activities: shownActivities('activity-sushi') })

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: false }),
    )
    await editor.close()
  })
})

describe('removing an Activity', () => {
  const openRemoval = () =>
    openEditor(
      ({ activities }: DayShows) =>
        useActivityRemoval({ scheduleId: scheduleA, date, activities }),
      { activities: tsukijiAndSushi },
    )

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

  it('keeps a removal not saved, with what it removes, while the Day still shows the Activity', async () => {
    vi.mocked(removeActivity).mockRejectedValue(new Error('offline'))
    const editor = await openRemoval()
    await act(() => editor.field().send('activity-tsukiji'))

    await editor.show({ activities: shownActivities('activity-tsukiji') })

    assert.deepStrictEqual(
      {
        notSaved: SaveState.$is('NotSaved')(editor.field().state),
        removing: editor.field().sent,
      },
      { notSaved: true, removing: 'activity-tsukiji' },
    )
    await editor.close()
  })
})
