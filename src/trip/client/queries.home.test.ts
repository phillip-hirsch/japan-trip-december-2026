// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { hashKey } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act } from 'react'

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
  homeBeforeTrip,
  homeDuringTrip,
  openHome,
  openHomeFromCold,
  snapshot,
  timePassesTo,
  todayOn,
  tokyoTime,
} from '@/trip/client/home-testing'
import {
  dayQuery,
  homeQuery,
  loadQuery,
  schedulesQuery,
} from '@/trip/client/queries'
import { answerSnapshot } from '@/trip/client/snapshot-testing'
import { december, HomeState } from '@/trip/domain/domain'
import { getHome, getScheduleSnapshot } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getHome: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

afterEach(closeHome)

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

  it('counts down offline with the Schedule as Home last read it, though older stored Schedules hold the same one', async () => {
    clockAt('2026-12-04T20:00:00')
    answerSnapshot(snapshot)
    answerHome(
      HomeState.cases.BeforeTrip.make({
        readAt: tokyoTime('2026-12-04T20:00:00').toISOString(),
        itineraries: [],
        daysToGo: 2,
        schedule: snapshot.schedules.current,
      }),
    )
    const queryClient = testQueryClient()
    const app = await openHome(queryClient)

    // Home reads again with the birthday outline edited on another device,
    // while the snapshot fails, so the stored Schedules predate the edit.
    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)

    const edited = HomeState.cases.BeforeTrip.make({
      readAt: tokyoTime('2026-12-04T21:00:00').toISOString(),
      itineraries: [],
      daysToGo: 2,
      schedule: currentSchedule({
        days: snapshot.days.map(({ day }) => day),
        birthdayOutline: 'Kaiseki at 19:00.',
      }),
    })

    answerHome(edited)
    await timePassesTo('2026-12-04T21:00:00')
    await act(() => loadQuery(queryClient, homeQuery))
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-05T00:00:00')

    assert.deepStrictEqual(app.shown(), {
      home: HomeState.cases.BeforeTrip.make({ ...edited, daysToGo: 1 }),
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
