import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { DayOutcome, december, IsoDate } from '@/trip/domain/domain'
import { currentSchedule, storage, testTrip } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

describe('runTripOperation for reads', () => {
  it.effect('answers Home and the Checklist as the Trip reads them', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        {
          home: yield* runTripOperation('home', undefined),
          checklist: yield* runTripOperation('checklist', undefined),
        },
        {
          home: yield* Trip.use((trip) => trip.home),
          checklist: yield* Trip.use((trip) => trip.checklist),
        },
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('answers the current Schedule and its map', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        {
          current: (yield* runTripOperation('schedules', undefined)).current,
          map: yield* runTripOperation('scheduleMap', undefined),
        },
        {
          current: yield* currentSchedule,
          map: yield* Trip.use((trip) => trip.scheduleMap),
        },
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('answers the Schedule snapshot as the Trip reads it', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* runTripOperation('scheduleSnapshot', undefined),
        yield* Trip.use((trip) => trip.scheduleSnapshot),
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'answers the Schedules with the Trip note once one is written',
    () =>
      Effect.gen(function* () {
        yield* Trip.use((trip) => trip.writeTripNote({ note: 'Pack a coat.' }))

        assert.deepStrictEqual(
          (yield* runTripOperation('schedules', undefined)).tripNote,
          'Pack a coat.',
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('answers a Day of the current Schedule with its page', () =>
    Effect.gen(function* () {
      const outcome = yield* runTripOperation('day', { date: december(14) })

      assert.deepStrictEqual(
        outcome,
        DayOutcome.cases.Day.make({
          page: yield* Trip.use((trip) => trip.day(december(14))),
        }),
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'answers a date outside the Trip with DayNotFound and the date',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('day', {
          date: IsoDate.make('2026-12-21'),
        })

        assert.deepStrictEqual(
          outcome,
          DayOutcome.cases.DayNotFound.make({
            date: IsoDate.make('2026-12-21'),
          }),
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )
})
