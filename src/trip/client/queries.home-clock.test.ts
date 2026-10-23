// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { hashKey } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'

import {
  loseConnection,
  serverOutOfReach,
  testQueryClient,
} from '@/trip/client/hook-testing'
import {
  clockAt,
  closeHome,
  homeDuringTrip,
  openHome,
  openHomeFromCold,
  openHomeRenderedIntoPage,
  serverReadsHome,
  snapshot,
  timePassesTo,
  todayOn,
} from '@/trip/client/home-testing'
import { dayQuery, homeQuery } from '@/trip/client/queries'
import { answerSnapshot } from '@/trip/client/snapshot-testing'
import { december } from '@/trip/domain/domain'
import type { HomeState } from '@/trip/domain/domain'
import { getHome } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getHome: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

afterEach(closeHome)

const minutes = 60_000

const hours = 60 * minutes

/** What Home shows, with the moment the server read it to the second. */
const toTheSecond = (
  shown: { readonly home: HomeState; readonly from: string } | undefined,
) =>
  shown && {
    ...shown,
    home: { ...shown.home, readAt: shown.home.readAt.slice(0, 19) },
  }

describe('Home with the device clock set wrong', () => {
  it.each([
    ['10 minutes', 10 * minutes],
    ['3 hours', 3 * hours],
  ])(
    "shows Today for the server's Tokyo date with the device clock %s fast, and moves on at the server's Tokyo midnight, offline",
    async (_, ahead) => {
      clockAt('2026-12-14T20:30:00', ahead)
      answerSnapshot(snapshot)
      serverReadsHome()
      const app = await openHome(testQueryClient())

      loseConnection()
      vi.mocked(getHome).mockImplementation(serverOutOfReach)
      await timePassesTo('2026-12-14T23:59:59')
      const beforeMidnight = app.shown()
      await timePassesTo('2026-12-15T00:00:01')

      assert.deepStrictEqual(
        { beforeMidnight, afterMidnight: app.shown() },
        {
          beforeMidnight: {
            home: homeDuringTrip('2026-12-14T20:30:00'),
            from: hashKey(homeQuery.queryKey),
          },
          afterMidnight: {
            home: { ...homeDuringTrip('2026-12-14T20:30:00'), ...todayOn(15) },
            from: hashKey(dayQuery(december(15)).queryKey),
          },
        },
      )
      await app.close()
    },
  )

  it.each([
    ['fast', 10 * minutes],
    ['slow', -10 * minutes],
  ])(
    "shows the new Day when opened offline after the server's Tokyo midnight, and not before it, with the device clock 10 minutes %s",
    async (_, ahead) => {
      clockAt('2026-12-14T21:00:00', ahead)
      answerSnapshot(snapshot)
      serverReadsHome()
      await (await openHomeFromCold()).close()

      loseConnection()
      vi.mocked(getHome).mockImplementation(serverOutOfReach)
      clockAt('2026-12-14T23:55:00', ahead)
      const beforeMidnight = await openHomeFromCold()
      const shownBefore = beforeMidnight.shown()
      await beforeMidnight.close()
      clockAt('2026-12-15T00:05:00', ahead)
      const afterMidnight = await openHomeFromCold()

      assert.deepStrictEqual(
        { beforeMidnight: shownBefore, afterMidnight: afterMidnight.shown() },
        {
          beforeMidnight: {
            home: homeDuringTrip('2026-12-14T21:00:00'),
            from: hashKey(homeQuery.queryKey),
          },
          afterMidnight: {
            home: { ...homeDuringTrip('2026-12-14T21:00:00'), ...todayOn(15) },
            from: hashKey(dayQuery(december(15)).queryKey),
          },
        },
      )
      await afterMidnight.close()
    },
  )

  it("is read again once, a second after the server's Tokyo midnight, with the device clock 5 minutes fast", async () => {
    clockAt('2026-12-14T23:50:00', 5 * minutes)
    answerSnapshot(snapshot)
    serverReadsHome()
    const app = await openHome(testQueryClient())
    const asOpened = app.shown()

    await timePassesTo('2026-12-14T23:59:59')
    const beforeMidnight = app.shown()
    await timePassesTo('2026-12-15T00:00:30')
    const afterMidnight = app.shown()

    assert.deepStrictEqual(
      { beforeMidnight, afterMidnight: toTheSecond(afterMidnight) },
      {
        beforeMidnight: asOpened,
        afterMidnight: toTheSecond({
          home: homeDuringTrip('2026-12-15T00:00:01'),
          from: hashKey(homeQuery.queryKey),
        }),
      },
    )
    await app.close()
  })

  it("shows Today for the server's Tokyo date on a page the server rendered, with the device clock 10 minutes fast, open offline and opened again from cold", async () => {
    clockAt('2026-12-14T23:50:00', 10 * minutes)
    answerSnapshot(snapshot)
    serverReadsHome()
    const app = await openHomeRenderedIntoPage()

    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-14T23:58:00')
    const openBeforeMidnight = app.shown()
    await app.close()
    const reopened = await openHomeFromCold()
    const reopenedBeforeMidnight = reopened.shown()
    await timePassesTo('2026-12-15T00:00:01')

    assert.deepStrictEqual(
      {
        openBeforeMidnight,
        reopenedBeforeMidnight,
        reopenedAfterMidnight: reopened.shown(),
      },
      {
        openBeforeMidnight: {
          home: homeDuringTrip('2026-12-14T23:50:00'),
          from: hashKey(homeQuery.queryKey),
        },
        reopenedBeforeMidnight: {
          home: homeDuringTrip('2026-12-14T23:50:00'),
          from: hashKey(homeQuery.queryKey),
        },
        reopenedAfterMidnight: {
          home: { ...homeDuringTrip('2026-12-14T23:50:00'), ...todayOn(15) },
          from: hashKey(dayQuery(december(15)).queryKey),
        },
      },
    )
    await reopened.close()
  })
})
