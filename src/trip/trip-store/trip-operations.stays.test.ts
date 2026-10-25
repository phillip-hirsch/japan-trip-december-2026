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
  choose,
  currentSchedule,
  currentScheduleId,
  kyotoHotelOf,
  kyotoStayId,
  operation,
  staysOf,
  storage,
  tripWithOption1,
  tripWithOptions1And2,
} from '@/trip/trip/testing'
import { ryokan } from '@/trip/trip/Trip.pins.testing'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

describe('runTripOperation for Hotel details', () => {
  it.effect('answers written Hotel details with Written', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* kyotoStayId(scheduleId)

      const outcome = yield* runTripOperation('writeHotelDetails', {
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
        const scheduleId = yield* currentScheduleId
        const stayId = yield* kyotoStayId(scheduleId)

        const outcome = yield* runTripOperation('writeHotelDetails', {
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

describe('runTripOperation for Stay edits', () => {
  it.effect('answers a split Stay with Edited and the Schedule after it', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* kyotoStayId(scheduleId)

      const outcome = yield* runTripOperation('splitStay', {
        scheduleId,
        operationId: operation(2),
        stayId,
        date: december(11),
      })

      assert.deepStrictEqual(
        outcome,
        StayEditOutcome.cases.Edited.make({ schedule: yield* currentSchedule }),
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'answers a merge of Stays in two Bases with HardRuleBroken and the rule',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const [, kyoto, kanazawa] = yield* staysOf(scheduleId)

        const outcome = yield* runTripOperation('mergeStays', {
          scheduleId,
          operationId: operation(2),
          stayIds: [kyoto?.id ?? '', kanazawa?.id ?? ''],
        })

        assert.deepStrictEqual(
          outcome,
          StayEditOutcome.cases.HardRuleBroken.make({
            rule: HardRule.cases.StaysInDifferentBases.make({}),
          }),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers a check-out moved on an archived Schedule with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const archived = yield* currentScheduleId
        const stayId = yield* kyotoStayId(archived)
        yield* choose(2, 2, archived)

        const outcome = yield* runTripOperation('moveStayBoundary', {
          scheduleId: archived,
          stayId,
          checkOut: december(12),
        })

        assert.deepStrictEqual(
          outcome,
          StayEditOutcome.cases.ScheduleChanged.make({}),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers a Base changed on a Stay the Schedule lacks with StayNotFound',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId

        const outcome = yield* runTripOperation('changeStayBase', {
          scheduleId,
          stayId: 'stay-missing',
          place: 'tokyo',
        })

        assert.deepStrictEqual(
          outcome,
          StayEditOutcome.cases.StayNotFound.make({ stayId: 'stay-missing' }),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})
