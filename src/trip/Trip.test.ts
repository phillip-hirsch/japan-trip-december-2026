import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect } from 'effect'
import { TestClock } from 'effect/testing'

import { Trip } from '@/trip/Trip'

const homeAt = (instant: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(
      DateTime.toEpochMillis(DateTime.makeUnsafe(instant)),
    )
    const trip = yield* Trip
    return yield* trip.home
  }).pipe(Effect.provide(Trip.layer))

describe('Trip.home countdown', () => {
  it.effect('shows 1 day remaining at 23:59 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-05T14:59:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 1 })
    }),
  )

  it.effect('shows 1 day remaining at 00:00 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-04T15:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 1 })
    }),
  )

  it.effect('has ended at 00:00 on December 6 in Tokyo', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-05T15:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Ended' })
    }),
  )

  it.effect('stays ended after the Trip', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-21T03:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Ended' })
    }),
  )

  it.effect('follows the Tokyo date when it is ahead of the UTC date', () =>
    Effect.gen(function* () {
      // 16:00 UTC on November 30 is 01:00 on December 1 in Tokyo.
      const home = yield* homeAt('2026-11-30T16:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 5 })
    }),
  )

  it.effect('follows the Tokyo date late in the Tokyo evening', () =>
    Effect.gen(function* () {
      // 14:59 UTC on November 30 is 23:59 on November 30 in Tokyo.
      const home = yield* homeAt('2026-11-30T14:59:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 6 })
    }),
  )

  it.effect('counts across a month boundary in Tokyo', () =>
    Effect.gen(function* () {
      // 23:30 UTC on September 30 is 08:30 on October 1 in Tokyo.
      const home = yield* homeAt('2026-09-30T23:30:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 66 })
    }),
  )
})
