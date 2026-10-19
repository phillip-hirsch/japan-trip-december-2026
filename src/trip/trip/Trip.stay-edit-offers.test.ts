// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { assert, describe, it } from '@effect/vitest'
import { Effect, Result, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'

import { tripDates } from '@/trip/domain/calendar'
import { december, StaysEdited } from '@/trip/domain/domain'
import type {
  IsoDate,
  OperationId,
  ScheduleDetail,
  ScheduleId,
  SplitStay,
} from '@/trip/domain/domain'
import {
  chooseOption1,
  currentSchedule,
  operation,
  option1WithTwoKyotoStays,
  scheduleById,
  storage,
  tripWith,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

/**
 * A sample Schedule: Tokyo, Kyoto, Kyoto again, Kanazawa and Tokyo again,
 * so only the two Kyoto Stays are in one Base.
 */
const sampleTrip = tripWith([option1WithTwoKyotoStays])

/** December dates from `from` through `to`. */
const decemberDates = (from: number, to: number) =>
  tripDates.filter((date) => date >= december(from) && date <= december(to))

/** Each Stay's offers, naming the Stays they refer to by their position. */
const offersByPosition = ({ stays }: ScheduleDetail) => {
  const position = (stayId: string) =>
    stays.findIndex(({ id }) => id === stayId)

  return stays.map(({ base, offers: { splitDates, mergeWith, boundary } }) => ({
    base: base.id,
    splitDates,
    mergeWith: mergeWith === undefined ? undefined : position(mergeWith),
    boundary:
      boundary === undefined
        ? undefined
        : { next: position(boundary.next), checkOuts: boundary.checkOuts },
  }))
}

const splitStay = (input: SplitStay) =>
  Trip.use((trip) => trip.splitStay(input))

/** A Stay edit as the Trip service runs it. */
type StayEditRun = ReturnType<typeof splitStay>

/** A Stay edit naming the Stays of a Schedule by their position. */
interface Candidate {
  readonly name: string
  readonly offered: boolean
  readonly edit: (
    scheduleId: ScheduleId,
    stayAt: (position: number) => string,
    operationId: OperationId,
  ) => StayEditRun
}

/**
 * Every split and Stay boundary move on a Trip date, and every merge of two
 * Stays, each marked with whether the Schedule read offers it.
 */
const candidatesOf = (schedule: ScheduleDetail): Array<Candidate> => {
  const offers = offersByPosition(schedule)

  const splits = offers.flatMap(({ splitDates }, position) =>
    tripDates.map((date): Candidate => ({
      name: `split Stay ${position} on ${date}`,
      offered: splitDates.includes(date),
      edit: (scheduleId, stayAt, operationId) =>
        splitStay({
          scheduleId,
          operationId,
          stayId: stayAt(position),
          date,
        }),
    })),
  )

  const boundaryMoves = offers.flatMap(({ boundary }, position) =>
    position === offers.length - 1
      ? []
      : tripDates.map((checkOut: IsoDate): Candidate => ({
          name: `move Stay ${position}'s check-out to ${checkOut}`,
          offered: boundary?.checkOuts.includes(checkOut) ?? false,
          edit: (scheduleId, stayAt) =>
            Trip.use((trip) =>
              trip.moveStayBoundary({
                scheduleId,
                stayId: stayAt(position),
                checkOut,
              }),
            ),
        })),
  )

  const merges = offers.flatMap(({ mergeWith }, earlier) =>
    offers.slice(earlier + 1).map((_, index): Candidate => {
      const later = earlier + 1 + index

      return {
        name: `merge Stays ${earlier} and ${later}`,
        offered: mergeWith === later,
        edit: (scheduleId, stayAt, operationId) =>
          Trip.use((trip) =>
            trip.mergeStays({
              scheduleId,
              operationId,
              stayIds: [stayAt(earlier), stayAt(later)],
            }),
          ),
      }
    }),
  )

  return [...splits, ...boundaryMoves, ...merges]
}

describe('the Stay edits each Stay offers', () => {
  it.effect(
    'are the dates it can split on, the next Stay in its Base to merge with, and where its check-out can move before the next Stay',
    () =>
      Effect.gen(function* () {
        yield* chooseOption1(1, null)

        assert.deepStrictEqual(offersByPosition(yield* currentSchedule), [
          {
            base: 'tokyo',
            splitDates: decemberDates(7, 8),
            mergeWith: undefined,
            boundary: { next: 1, checkOuts: decemberDates(7, 10) },
          },
          {
            base: 'kyoto',
            splitDates: [december(10)],
            mergeWith: 2,
            boundary: { next: 2, checkOuts: decemberDates(10, 12) },
          },
          {
            base: 'kyoto',
            splitDates: [december(12)],
            mergeWith: undefined,
            boundary: { next: 3, checkOuts: decemberDates(12, 16) },
          },
          {
            base: 'kanazawa',
            splitDates: decemberDates(14, 16),
            mergeWith: undefined,
            boundary: { next: 4, checkOuts: decemberDates(14, 19) },
          },
          {
            base: 'tokyo',
            splitDates: decemberDates(18, 19),
            mergeWith: undefined,
            boundary: undefined,
          },
        ])
      }).pipe(Effect.provide([sampleTrip, storage])),
  )

  it.effect(
    'are accepted, and every Stay edit not offered is refused by a Hard rule',
    () =>
      Effect.gen(function* () {
        let n = 1
        let scheduleId = yield* chooseOption1(n++, null)
        const candidates = candidatesOf(yield* scheduleById(scheduleId))
        const mismatches: Array<string> = []

        for (const { name, offered, edit } of candidates) {
          const { stays } = yield* scheduleById(scheduleId)

          const stayAt = (position: number) =>
            stays[position]?.id ?? assert.fail(`No Stay ${position}`)

          const outcome = yield* Effect.result(
            edit(scheduleId, stayAt, operation(n++)),
          )

          const answer = Result.isSuccess(outcome)
            ? 'accepted'
            : outcome.failure._tag

          if (answer !== (offered ? 'accepted' : 'HardRuleBroken')) {
            mismatches.push(`${name}: offered ${offered}, ${answer}`)
          }

          // An accepted edit changed the Schedule, so the next one starts
          // from a fresh copy of the same sample.
          if (Result.isSuccess(outcome)) {
            scheduleId = yield* chooseOption1(n++, scheduleId)
          }
        }

        assert.deepStrictEqual(mismatches, [])
        // 9 splits, the Kyoto merge and 18 check-out moves, so the Stay edits
        // tried include accepted ones, not only refusals.
        assert.strictEqual(
          candidates.filter(({ offered }) => offered).length,
          9 + 1 + 18,
        )
      }).pipe(Effect.provide([sampleTrip, storage])),
  )

  it.effect(
    'are absent from a Stay edit recorded before the Schedule read had them, which a retry still returns',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* chooseOption1(1, null)
        const kyotoId = (yield* currentSchedule).stays[1]?.id ?? ''

        const split = splitStay({
          scheduleId,
          operationId: operation(2),
          stayId: kyotoId,
          date: december(10),
        })

        const first = yield* split
        const { schedule } = first

        // The SQL client stands in for storage written by an earlier
        // version: it holds the same result, recorded without offers.
        const encoded = yield* Schema.encodeEffect(StaysEdited)(first)

        const earlier = {
          schedule: {
            ...encoded.schedule,
            stays: encoded.schedule.stays.map((stay) =>
              Struct.omit(stay, ['offers']),
            ),
          },
        }

        const sql = yield* SqlClient.SqlClient
        yield* sql`UPDATE operations SET result = ${JSON.stringify(earlier)} WHERE id = ${operation(2)}`

        const retried = yield* split

        assert.deepStrictEqual(
          retried.schedule.stays.map(({ id, offers }) => ({ id, offers })),
          schedule.stays.map(({ id }) => ({ id, offers: { splitDates: [] } })),
        )
      }).pipe(Effect.provide([sampleTrip, storage])),
  )
})
