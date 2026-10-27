import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import {
  december,
  HardRule,
  Hotel,
  StayEditOutcome,
  WriteHotelDetailsOutcome,
} from '@/trip/domain/domain'
import { hotelDetailMaxLength } from '@/trip/domain/limits'
import {
  currentSchedule,
  kyotoHotel,
  kyotoStayId,
  operation,
  currentStays,
  storage,
  testTrip,
} from '@/trip/trip/testing'
import { ryokan } from '@/trip/trip/Trip.pins.testing'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

describe('runTripOperation for Hotel details', () => {
  it.effect('answers written Hotel details with Written', () =>
    Effect.gen(function* () {
      const stayId = yield* kyotoStayId

      const outcome = yield* runTripOperation('writeHotelDetails', {
        stayId,
        details: ryokan,
      })

      assert.deepStrictEqual(
        { outcome, hotel: yield* kyotoHotel },
        {
          outcome: WriteHotelDetailsOutcome.cases.Written.make({}),
          hotel: Hotel.cases.Recorded.make(ryokan),
        },
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'answers a Hotel detail too long with HotelDetailTooLong and the limit',
    () =>
      Effect.gen(function* () {
        const stayId = yield* kyotoStayId

        const outcome = yield* runTripOperation('writeHotelDetails', {
          stayId,
          details: { name: 'あ'.repeat(hotelDetailMaxLength + 1) },
        })

        assert.deepStrictEqual(
          { outcome, hotel: yield* kyotoHotel },
          {
            outcome: WriteHotelDetailsOutcome.cases.HotelDetailTooLong.make({
              maxLength: hotelDetailMaxLength,
            }),
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )
})

describe('runTripOperation for Stay edits', () => {
  it.effect('answers a split Stay with Edited and the Schedule after it', () =>
    Effect.gen(function* () {
      const stayId = yield* kyotoStayId

      const outcome = yield* runTripOperation('splitStay', {
        operationId: operation(2),
        stayId,
        date: december(11),
      })

      assert.deepStrictEqual(
        outcome,
        StayEditOutcome.cases.Edited.make({ schedule: yield* currentSchedule }),
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'answers a merge of Stays in two Bases with HardRuleBroken and the rule',
    () =>
      Effect.gen(function* () {
        const [, kyoto, kanazawa] = yield* currentStays

        const outcome = yield* runTripOperation('mergeStays', {
          operationId: operation(2),
          stayIds: [kyoto?.id ?? '', kanazawa?.id ?? ''],
        })

        assert.deepStrictEqual(
          outcome,
          StayEditOutcome.cases.HardRuleBroken.make({
            rule: HardRule.cases.StaysInDifferentBases.make({}),
          }),
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'answers a Base changed on a Stay the Schedule lacks with StayNotFound',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('changeStayBase', {
          stayId: 'stay-missing',
          place: 'tokyo',
        })

        assert.deepStrictEqual(
          outcome,
          StayEditOutcome.cases.StayNotFound.make({ stayId: 'stay-missing' }),
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )
})
