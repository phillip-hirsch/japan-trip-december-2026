// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { hashKey, onlineManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { currentSchedule } from '@/trip/client/editor-testing'
import {
  loseConnection,
  serverOutOfReach,
  testQueryClient,
  withClient,
} from '@/trip/client/hook-testing'
import {
  dayQuery,
  homeQuery,
  schedulesQuery,
  loadQuery,
  useHome,
  useScheduleSnapshot,
} from '@/trip/client/queries'
import {
  answerSnapshot,
  dayPage,
  snapshotWith,
} from '@/trip/client/snapshot-testing'
import { december, HomeState, ScheduleId } from '@/trip/domain/domain'
import {
  getHome,
  getSchedules,
  getScheduleSnapshot,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getHome: vi.fn(),
  getSchedules: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

const otherScheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000b')

const tokyoTime = (iso: string) => new Date(`${iso}+09:00`)

/** Sets the device's clock to `iso`, Tokyo time, and lets it run. */
const clockAt = (iso: string) => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
    shouldAdvanceTime: true,
  })
  vi.setSystemTime(tokyoTime(iso))
}

/** Lets the device's clock run on to `iso`, Tokyo time. */
const timePassesTo = (iso: string) =>
  act(() => vi.advanceTimersByTimeAsync(tokyoTime(iso).getTime() - Date.now()))

/** Lets pending reads answer and the renders they cause finish. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0))

const snapshot = snapshotWith('Onsen at 18:00.')

/** Home as the server reads it during the Trip, at `iso` Tokyo time. */
const homeDuringTrip = (iso: string) => {
  const readAt = tokyoTime(iso)

  return HomeState.cases.DuringTrip.make({
    readAt: readAt.toISOString(),
    itineraries: [],
    ...todayOn(Number(iso.slice(8, 10))),
  })
}

/** Home as the server reads it on December 5, the day before the Trip. */
const homeBeforeTrip = HomeState.cases.BeforeTrip.make({
  readAt: tokyoTime('2026-12-05T22:00:00').toISOString(),
  itineraries: [],
  daysToGo: 1,
  schedule: snapshot.schedules.current,
})

const answerHome = (home: HomeState) =>
  vi.mocked(getHome).mockResolvedValue(home)

/**
 * Opens Home as the app does: its loader reads Home, and the root keeps the
 * Schedule snapshot. The hook's answer is kept per render.
 */
const openHome = async (queryClient: QueryClient) => {
  const renders: Array<ReturnType<typeof useHome>> = []
  await loadQuery(queryClient, homeQuery)

  const App = () => {
    useScheduleSnapshot()
    renders.push(useHome())

    return null
  }

  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(withClient(queryClient, createElement(App))),
  )
  await settle()

  return {
    /** What Home shows now, and which query its data came from. */
    shown: () => {
      const last = renders.at(-1)

      return last && { home: last.home, from: hashKey(last.query.queryKey) }
    },
    close: () => act(async () => root.unmount()),
  }
}

/**
 * Opens Home from cold, as the Home Screen app does, on a cache the device
 * keeps. `close` closes the app fully, once what it keeps is on the device.
 */
const openHomeFromCold = async () => {
  const queryClient = testQueryClient()
  const kept = keepCacheOnDevice(queryClient)
  const app = await openHome(queryClient)

  return {
    ...app,
    close: async () => {
      await act(() => kept.saved())
      await app.close()
    },
  }
}

afterEach(async () => {
  vi.useRealTimers()
  await clear()
  reportConnection(connected)
  onlineManager.setOnline(true)
  vi.mocked(getHome).mockReset()
})

describe('Home offline during the Trip', () => {
  it('moves on to the next Day at Tokyo midnight while the app stays open offline', async () => {
    clockAt('2026-12-14T21:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T21:00:00'))
    const app = await openHome(testQueryClient())

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: { ...homeDuringTrip('2026-12-14T21:00:00'), ...todayOn(15) },
      from: hashKey(dayQuery(december(15)).queryKey),
    })
    await app.close()
  })

  it('shows the new Day when the app is opened offline after Tokyo midnight', async () => {
    clockAt('2026-12-14T21:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T21:00:00'))
    await (await openHomeFromCold()).close()

    vi.setSystemTime(tokyoTime('2026-12-15T07:30:00'))
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHomeFromCold()

    assert.deepStrictEqual(app.shown(), {
      home: { ...homeDuringTrip('2026-12-14T21:00:00'), ...todayOn(15) },
      from: hashKey(dayQuery(december(15)).queryKey),
    })
    await app.close()
  })
})

describe('Home offline at the Trip boundaries', () => {
  it('counts down a day at Tokyo midnight offline though no snapshot answered, from the Schedule Home was read with', async () => {
    clockAt('2026-12-04T22:00:00')
    vi.mocked(getScheduleSnapshot).mockImplementation(
      () => new Promise(() => {}),
    )

    const withSchedule = HomeState.cases.BeforeTrip.make({
      readAt: tokyoTime('2026-12-04T22:00:00').toISOString(),
      itineraries: [],
      daysToGo: 2,
      schedule: snapshot.schedules.current,
    })

    answerHome(withSchedule)
    const app = await openHome(testQueryClient())

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-05T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.BeforeTrip.make({ ...withSchedule, daysToGo: 1 }),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('counts down a day at Tokyo midnight offline before a Schedule is chosen', async () => {
    clockAt('2026-12-04T22:00:00')
    vi.mocked(getScheduleSnapshot).mockResolvedValue(null)

    const noSchedule = HomeState.cases.BeforeTrip.make({
      readAt: tokyoTime('2026-12-04T22:00:00').toISOString(),
      itineraries: [],
      daysToGo: 2,
      schedule: null,
    })

    answerHome(noSchedule)
    const app = await openHome(testQueryClient())

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-05T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.BeforeTrip.make({ ...noSchedule, daysToGo: 1 }),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('begins the Trip with Today on December 6 at Tokyo midnight, offline', async () => {
    clockAt('2026-12-05T22:00:00')
    answerSnapshot(snapshot)
    answerHome(homeBeforeTrip)
    const app = await openHome(testQueryClient())

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-06T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.DuringTrip.make({
        readAt: homeBeforeTrip.readAt,
        itineraries: [],
        ...todayOn(6),
      }),
      from: hashKey(dayQuery(december(6)).queryKey),
    })
    await app.close()
  })

  it('shows the Schedule as a record after the Trip, from 00:00 on December 21 in Tokyo, offline', async () => {
    clockAt('2026-12-20T21:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-20T21:00:00'))
    const app = await openHome(testQueryClient())

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-21T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.AfterTrip.make({
        readAt: homeDuringTrip('2026-12-20T21:00:00').readAt,
        itineraries: [],
        schedule: snapshot.schedules.current,
      }),
      from: hashKey(schedulesQuery.queryKey),
    })
    await app.close()
  })
})

describe('Home after it moved on offline', () => {
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
      archived: [],
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

/** Today on December `day`, as the Schedule snapshot stored it. */
const todayOn = (day: number) => {
  const date = december(day)

  return {
    date,
    today: snapshot.days.find((page) => page.day.date === date) ?? null,
  }
}
