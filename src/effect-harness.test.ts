import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect } from 'effect'
import { TestClock } from 'effect/testing'

describe('Effect test harness', () => {
  it.effect('reads the Tokyo date from a controlled clock', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(
        DateTime.toEpochMillis(DateTime.makeUnsafe('2026-12-05T15:00:00Z')),
      )
      const now = yield* DateTime.now
      const today = DateTime.formatIsoDate(
        DateTime.setZoneNamedUnsafe(now, 'Asia/Tokyo'),
      )
      assert.strictEqual(today, '2026-12-06')
    }),
  )
})
