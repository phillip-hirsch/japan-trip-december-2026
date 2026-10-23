// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { hashKey, onlineManager } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { connected, reportConnection } from '@/access/connection-status'
import { currentSchedule } from '@/trip/client/editor-testing'
import {
  loseConnection,
  serverOutOfReach,
  testQueryClient,
} from '@/trip/client/hook-testing'
import {
  answerHome,
  clockAt,
  closeHome,
  homeDuringTrip,
  openHome,
  openRoot,
  option1Archived,
  option2Snapshot,
  otherScheduleId,
  settle,
  snapshot,
  timePassesTo,
  tokyoTime,
} from '@/trip/client/home-testing'
import {
  dayQuery,
  homeQuery,
  invalidateAfter,
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
  getDay: vi.fn(),
  getHome: vi.fn(),
  getSchedules: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

afterEach(closeHome)

describe('Home after it moved on offline', () => {
  it("shows the new Day of a Schedule that replaced Home's at the very moment Home was read", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const queryClient = testQueryClient()
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
    answerSnapshot(archivedAsHomeWasRead)
    await act(() => invalidateAfter(queryClient, 'choose'))
    await settle()
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
  })

  it('shows the new Day of a Schedule chosen here after Home was last read, though the device clock runs behind the server', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const queryClient = testQueryClient()
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // The device's clock is set back ten minutes, so the snapshot that
    // stores Option 2's choice answers before Home did by its clock.
    vi.setSystemTime(tokyoTime('2026-12-14T19:50:00'))
    answerSnapshot(option2Snapshot)
    await act(() => invalidateAfter(queryClient, 'choose'))
    await settle()
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
    const queryClient = testQueryClient()
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // Phillip chooses Option 2 from its page, away from Home, and the
    // snapshot stores its Schedules and every Day.
    await timePassesTo('2026-12-14T20:30:00')
    answerSnapshot(option2Snapshot)
    await act(() => invalidateAfter(queryClient, 'choose'))
    await settle()
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
