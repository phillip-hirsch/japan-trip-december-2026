// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { hashKey, onlineManager } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { currentSchedule, deferred } from '@/trip/client/editor-testing'
import {
  loseConnection,
  outcomeOf,
  serverOutOfReach,
  testQueryClient,
} from '@/trip/client/hook-testing'
import {
  answerHome,
  chooseOption2,
  clockAt,
  closeHome,
  homeDuringTrip,
  openChoiceOfOption2,
  openDayNote,
  openHome,
  openHomeFromCold,
  openRoot,
  option1Archived,
  option2Snapshot,
  otherScheduleId,
  saveDayNote,
  settle,
  snapshot,
  timePassesTo,
  tokyoTime,
} from '@/trip/client/home-testing'
import {
  dayQuery,
  homeQuery,
  loadQuery,
  schedulesQuery,
} from '@/trip/client/queries'
import { answerSnapshot, dayPage } from '@/trip/client/snapshot-testing'
import { december, HomeState, IsoInstant } from '@/trip/domain/domain'
import {
  getDay,
  getHome,
  getSchedules,
  getScheduleSnapshot,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  chooseItinerary: vi.fn(),
  getDay: vi.fn(),
  getHome: vi.fn(),
  getSchedules: vi.fn(),
  getScheduleSnapshot: vi.fn(),
  writeDayNote: vi.fn(),
}))

afterEach(closeHome)

describe('Home after a save away from it', () => {
  it("holds the saved Day note once the connection returns, though Home's read after the save failed", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()

    // The signal drops right after the save, before Home's read answers.
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    answerHome(withNote)
    await act(async () => reportConnection(connected))
    await settle()
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown()?.home, withNote)
    await app.close()
    await dayNote.close()
  })

  it('opens Home online while a save lands during its read, then holds the saved Day note', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote

    // Phillip opens Home for the first time this session, and his Day note
    // save lands during its read, which started before the save.
    const beforeSave = deferred<HomeState>()
    vi.mocked(getHome).mockImplementation(() => beforeSave.promise)
    const opening = outcomeOf(loadQuery(queryClient, homeQuery))

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    vi.mocked(getHome).mockResolvedValue(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await act(async () =>
      beforeSave.resolve(homeDuringTrip('2026-12-14T20:00:00')),
    )
    await settle()
    const opened = await opening
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      { opened, home: app.shown()?.home },
      { opened: 'answered', home: withNote },
    )
    await app.close()
    await dayNote.close()
  })

  it('holds the saved Day note though the device clock went back during a read of Home', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()

    const beforeSave = deferred<HomeState>()
    vi.mocked(getHome).mockImplementation(() => beforeSave.promise)
    const opening = loadQuery(queryClient, homeQuery)
    vi.setSystemTime(tokyoTime('2026-12-14T19:50:00'))

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    vi.mocked(getHome).mockResolvedValue(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await act(async () =>
      beforeSave.resolve(homeDuringTrip('2026-12-14T20:00:00')),
    )
    await settle()
    await opening
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown()?.home, withNote)
    await app.close()
    await dayNote.close()
  })

  it('opens offline with a Day note saved after a restart straight onto another page', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    await (await openHomeFromCold()).close()

    // The app restarts on December 14's page, so Home is only what the
    // device kept, and Phillip saves its Day note there.
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const kept = keepCacheOnDevice(queryClient)
    await act(() => kept.saved())
    await timePassesTo('2026-12-14T20:30:00')

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:30:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    answerHome(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown(), {
      home: withNote,
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
    await dayNote.close()
  })

  it('opens offline with a Day note saved on another page while Home was closed', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // Phillip saves December 14's Day note on its own page.
    await timePassesTo('2026-12-14T20:30:00')

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:30:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    answerHome(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown(), {
      home: withNote,
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
    await root.close()
    await dayNote.close()
  })
})

describe('Home after it moved on offline', () => {
  it("shows the new Day of a Schedule that replaced Home's at the very moment Home was read", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const choice = await openChoiceOfOption2()
    const { queryClient } = choice
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // Home saw Option 1's Schedule current, so the server archived it after
    // that read, though in the same millisecond.
    const archivedAsHomeWasRead = {
      ...option2Snapshot,
      schedules: {
        ...option2Snapshot.schedules,
        archived: [
          {
            ...option1Archived,
            archivedAt: IsoInstant.make(
              tokyoTime('2026-12-14T20:00:00').toISOString(),
            ),
          },
        ],
      },
    }

    await timePassesTo('2026-12-14T20:30:00')
    // Home's own read after the choice never answers before the signal goes.
    vi.mocked(getHome).mockImplementation(() => new Promise(() => {}))
    await chooseOption2(choice, archivedAsHomeWasRead)
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T07:00:00')
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      app.shown()?.home,
      HomeState.cases.DuringTrip.make({
        ...homeDuringTrip('2026-12-14T20:00:00'),
        date: december(15),
        today:
          option2Snapshot.days.find((page) => page.day.date === december(15)) ??
          null,
      }),
    )
    await app.close()
    await root.close()
    await choice.close()
  })

  it('shows the new Day of a Schedule chosen here after Home was last read, though the device clock runs behind the server', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const choice = await openChoiceOfOption2()
    const { queryClient } = choice
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // The device's clock is set back ten minutes, so the snapshot that
    // stores Option 2's choice answers before Home did by its clock.
    vi.setSystemTime(tokyoTime('2026-12-14T19:50:00'))
    // Home's own read after the choice never answers before the signal goes.
    vi.mocked(getHome).mockImplementation(() => new Promise(() => {}))
    await chooseOption2(choice, option2Snapshot)
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T07:00:00')
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.DuringTrip.make({
        ...homeDuringTrip('2026-12-14T20:00:00'),
        date: december(15),
        today:
          option2Snapshot.days.find((page) => page.day.date === december(15)) ??
          null,
      }),
      from: hashKey(dayQuery(december(15)).queryKey),
    })
    await app.close()
    await root.close()
    await choice.close()
  })

  it('shows no Day as Today when Home was last read with no Schedule, though a Day is stored', async () => {
    clockAt('2026-12-14T20:00:00')
    vi.mocked(getScheduleSnapshot).mockResolvedValue(null)

    const noSchedule = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: null,
    })

    answerHome(noSchedule)
    const queryClient = testQueryClient()
    vi.mocked(getDay).mockResolvedValue(dayPage(december(15)))
    await loadQuery(queryClient, dayQuery(december(15)))
    const app = await openHome(queryClient)

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.DuringTrip.make({
        ...noSchedule,
        date: december(15),
      }),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('shows the new Day of a Schedule chosen here after Home was last read, opened offline after Tokyo midnight', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const choice = await openChoiceOfOption2()
    const { queryClient } = choice
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // Phillip chooses Option 2 from its page, away from Home, and the
    // snapshot stores its Schedules and every Day.
    await timePassesTo('2026-12-14T20:30:00')
    // Home's own read after the choice never answers before the signal goes.
    vi.mocked(getHome).mockImplementation(() => new Promise(() => {}))
    await chooseOption2(choice, option2Snapshot)
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T07:00:00')
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.DuringTrip.make({
        ...homeDuringTrip('2026-12-14T20:00:00'),
        date: december(15),
        today:
          option2Snapshot.days.find((page) => page.day.date === december(15)) ??
          null,
      }),
      from: hashKey(dayQuery(december(15)).queryKey),
    })
    await app.close()
    await root.close()
    await choice.close()
  })

  it('stays as last read rather than go back to a Schedule a later Home read replaced', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const queryClient = testQueryClient()
    const app = await openHome(queryClient)

    // Home reads again with Option 2's Day, chosen on another device, while
    // the snapshot fails, so the Schedules and every Day are still Option 1's.
    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)

    const homeWithOption2 = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T21:00:00'),
      today: { ...dayPage(december(14)), scheduleId: otherScheduleId },
    })

    answerHome(homeWithOption2)
    await act(() => loadQuery(queryClient, homeQuery))
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: homeWithOption2,
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('stays as last read rather than show a Day of a Schedule since replaced', async () => {
    clockAt('2026-12-14T21:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T21:00:00'))
    const queryClient = testQueryClient()
    const app = await openHome(queryClient)

    // Option 2 replaced the Schedule on another device. The Schedules read
    // again here, but no snapshot answered since, so every Day is Option 1's.
    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)
    vi.mocked(getSchedules).mockResolvedValue({
      current: currentSchedule({ id: otherScheduleId, sourceOptionNumber: 2 }),
      archived: [
        {
          ...option1Archived,
          archivedAt: IsoInstant.make(
            tokyoTime('2026-12-14T21:30:00').toISOString(),
          ),
        },
      ],
    })
    await act(() => loadQuery(queryClient, schedulesQuery))
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: homeDuringTrip('2026-12-14T21:00:00'),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('shows Home as the server reads it again once the connection returns', async () => {
    clockAt('2026-12-14T21:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T21:00:00'))
    const app = await openHome(testQueryClient())
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T07:00:00')

    answerHome(homeDuringTrip('2026-12-15T07:05:00'))
    await act(async () => {
      onlineManager.setOnline(true)
      reportConnection(connected)
    })
    await timePassesTo('2026-12-15T07:05:00')

    assert.deepStrictEqual(app.shown(), {
      home: homeDuringTrip('2026-12-15T07:05:00'),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('never moves back to the day before when the device clock runs behind the server', async () => {
    clockAt('2026-12-14T23:59:30')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-15T00:00:10'))
    const app = await openHome(testQueryClient())

    assert.deepStrictEqual(app.shown(), {
      home: homeDuringTrip('2026-12-15T00:00:10'),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })
})
