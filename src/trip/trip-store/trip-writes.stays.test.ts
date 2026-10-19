import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { Hotel, WriteHotelDetailsOutcome } from '@/trip/domain/domain'
import { hotelDetailMaxLength } from '@/trip/domain/limits'
import {
  choose,
  kyotoHotelOf,
  kyotoStayId,
  storage,
  tripWithOption1,
} from '@/trip/trip/testing'
import { ryokan } from '@/trip/trip/Trip.pins.testing'
import { runTripWrite } from '@/trip/trip-store/trip-writes'

describe('runTripWrite for Hotel details', () => {
  it.effect('answers written Hotel details with Written', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const stayId = yield* kyotoStayId(scheduleId)

      const outcome = yield* runTripWrite('writeHotelDetails', {
        scheduleId,
        stayId,
        details: ryokan,
      })

      assert.deepStrictEqual(
        { outcome, hotel: yield* kyotoHotelOf(scheduleId) },
        {
          outcome: WriteHotelDetailsOutcome.cases.Written.make({}),
          hotel: Hotel.cases.Recorded.make(ryokan),
        },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'answers a Hotel detail too long with HotelDetailTooLong and the limit',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)

        const outcome = yield* runTripWrite('writeHotelDetails', {
          scheduleId,
          stayId,
          details: { name: 'あ'.repeat(hotelDetailMaxLength + 1) },
        })

        assert.deepStrictEqual(
          { outcome, hotel: yield* kyotoHotelOf(scheduleId) },
          {
            outcome: WriteHotelDetailsOutcome.cases.HotelDetailTooLong.make({
              maxLength: hotelDetailMaxLength,
            }),
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
