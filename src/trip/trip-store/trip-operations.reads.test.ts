import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import {
  DayOutcome,
  december,
  IsoDate,
  ScheduleId,
  ScheduleOutcome,
} from '@/trip/domain/domain'
import {
  choose,
  currentSchedule,
  currentScheduleId,
  storage,
  tripWithOptions1And2,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

const unknownScheduleId = ScheduleId.make(
  '00000000-0000-4000-8000-000000000999',
)

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
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('answers the current Schedule, its map and summary', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        {
          current: (yield* runTripOperation('schedules', undefined)).current,
          map: yield* runTripOperation('scheduleMap', undefined),
          summary: yield* runTripOperation('scheduleSummary', undefined),
        },
        {
          current: yield* currentSchedule,
          map: yield* Trip.use((trip) => trip.scheduleMap),
          summary: Option.getOrThrow(
            yield* Trip.use((trip) => trip.scheduleSummary),
          ),
        },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('answers the Schedule snapshot as the Trip reads it', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* runTripOperation('scheduleSnapshot', undefined),
        yield* Trip.use((trip) => trip.scheduleSnapshot),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
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
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
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
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
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
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('answers an archived Schedule by its id', () =>
    Effect.gen(function* () {
      const archived = yield* currentScheduleId
      yield* choose(2, 2, archived)

      const outcome = yield* runTripOperation('schedule', {
        scheduleId: archived,
      })

      assert.deepStrictEqual(
        outcome,
        ScheduleOutcome.cases.Schedule.make({
          schedule: yield* Trip.use((trip) => trip.schedule(archived)),
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers a Schedule that never existed with ScheduleNotFound and its id',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('schedule', {
          scheduleId: unknownScheduleId,
        })

        assert.deepStrictEqual(
          outcome,
          ScheduleOutcome.cases.ScheduleNotFound.make({
            scheduleId: unknownScheduleId,
          }),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})
