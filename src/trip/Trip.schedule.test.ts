// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Layer, Option, Predicate, Struct } from 'effect'
import { TestClock } from 'effect/testing'

import { december } from '@/trip/domain'
import type { ItineraryContent, OperationId } from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { option1 } from '@/trip/itineraries/option-1'
import { migrations } from '@/trip/migrations'
import { Trip } from '@/trip/Trip'

/**
 * A fresh database for each test: the Durable Object's SQL and migrations,
 * over Node's SQLite in memory.
 */
const storage = Layer.effectDiscard(
  SqliteMigrator.run({ loader: migrations }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })))

const tripWith = (contents: ReadonlyArray<ItineraryContent>) =>
  Trip.layer.pipe(Layer.provide(Itineraries.fromContent(contents)))

/** Option 1 with a Verify claim about the Itinerary as a whole. */
const option1WithEveryAttachment: ItineraryContent = {
  ...option1,
  verifyClaims: [
    ...option1.verifyClaims,
    {
      id: 'rail-pass',
      text: 'Rail pass prices change in October.',
      attachedTo: { _tag: 'Itinerary' },
    },
  ],
}

const trip = tripWith([option1WithEveryAttachment])

const firstChoose = '7d1f8c2e-4b6a-4f0e-9a3d-2c5b8e1f4a60' as OperationId
const secondChoose = 'c4e2a9b1-3f7d-4e8a-b6c0-9d1e5f2a7b38' as OperationId

const chooseOption1 = (operationId: OperationId) =>
  Trip.use((trip) => trip.choose({ operationId, optionNumber: 1 }))

const currentSchedule = Trip.use((trip) => trip.currentSchedule).pipe(
  Effect.map(Option.getOrThrow),
)

/**
 * A value with every `id` removed, at any depth, to compare a Schedule's copy
 * with the Itinerary it came from.
 */
const withoutIds = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutIds)
    : Predicate.isObject(value)
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'id')
            .map(([key, nested]) => [key, withoutIds(nested)]),
        )
      : value

describe('Trip.currentSchedule', () => {
  it.effect('is empty before anything is chosen', () =>
    Effect.gen(function* () {
      const schedule = yield* Trip.use((trip) => trip.currentSchedule)
      assert.isTrue(Option.isNone(schedule))
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.scheduleSummary', () => {
  it.effect('is empty before anything is chosen', () =>
    Effect.gen(function* () {
      const summary = yield* Trip.use((trip) => trip.scheduleSummary)
      assert.isTrue(Option.isNone(summary))
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('names the Itinerary the current Schedule came from', () =>
    Effect.gen(function* () {
      yield* chooseOption1(firstChoose)
      const summary = yield* Trip.use((trip) => trip.scheduleSummary)
      assert.deepStrictEqual(summary, Option.some({ sourceOptionNumber: 1 }))
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.choose', () => {
  it.effect('copies the whole Itinerary into a new current Schedule', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(
        DateTime.toEpochMillis(DateTime.makeUnsafe('2026-10-01T09:30:00Z')),
      )
      const chosen = yield* chooseOption1(firstChoose)
      const schedule = yield* currentSchedule
      const itinerary = yield* Trip.use((trip) => trip.itinerary(1))

      assert.deepStrictEqual(
        {
          id: schedule.id,
          status: schedule.status,
          sourceOptionNumber: schedule.sourceOptionNumber,
          sourceContentVersion: schedule.sourceContentVersion,
          chosenAt: schedule.chosenAt,
          birthdayOutline: schedule.birthdayOutline,
        },
        {
          id: chosen.scheduleId,
          status: 'current',
          sourceOptionNumber: 1,
          sourceContentVersion: itinerary.contentVersion,
          chosenAt: '2026-10-01T09:30:00.000Z',
          birthdayOutline: option1.birthdayOutline,
        },
      )
      // Stays with their highlights and accommodation; each Day's
      // description, Anchors, Move with its rail sections and duration, Day
      // trips and Verify claims; and the Verify claims about the whole.
      assert.deepStrictEqual(
        withoutIds({
          stays: schedule.stays,
          days: schedule.days,
          verifyClaims: schedule.verifyClaims,
        }),
        withoutIds({
          stays: itinerary.stays,
          days: itinerary.days,
          verifyClaims: itinerary.verifyClaims,
        }),
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'gives every copied Stay, Move, Day trip, Verify claim and Anchor a fresh id',
    () =>
      Effect.gen(function* () {
        yield* chooseOption1(firstChoose)
        const { stays, days, verifyClaims } = yield* currentSchedule

        const copied = [
          ...stays,
          ...days.flatMap((day) => [
            ...day.anchors,
            ...(day.move ? [day.move] : []),
            ...day.dayTrips,
            ...day.verifyClaims,
          ]),
          ...stays.flatMap((stay) => stay.verifyClaims),
          ...verifyClaims,
        ]
        const ids = copied.map((entity) => entity.id)
        const contentIds = option1WithEveryAttachment.verifyClaims.map(
          (claim) => claim.id,
        )
        assert.deepStrictEqual(
          {
            allDistinct: new Set(ids).size === ids.length,
            fromContent: ids.filter((id) => contentIds.includes(id)),
          },
          { allDistinct: true, fromContent: [] },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('returns the recorded result when an operation id repeats', () =>
    Effect.gen(function* () {
      const first = yield* chooseOption1(firstChoose)
      const before = yield* currentSchedule
      const repeated = yield* chooseOption1(firstChoose)
      // The same operation id names the same choose, whatever it now asks.
      const reworded = yield* Trip.use((trip) =>
        trip.choose({ operationId: firstChoose, optionNumber: 2 }),
      )
      assert.deepStrictEqual(
        { repeated, reworded, after: yield* currentSchedule },
        { repeated: first, reworded: first, after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses another choose while a Schedule is current', () =>
    Effect.gen(function* () {
      yield* chooseOption1(firstChoose)
      const before = yield* currentSchedule
      const error = yield* Effect.flip(chooseOption1(secondChoose))
      assert.deepStrictEqual(
        {
          tag: error._tag,
          after: yield* currentSchedule,
        },
        { tag: 'ScheduleAlreadyChosen', after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with ItineraryNotFound and chooses nothing', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.choose({ operationId: firstChoose, optionNumber: 99 }),
        ),
      )
      const schedule = yield* Trip.use((trip) => trip.currentSchedule)
      assert.deepStrictEqual(
        { tag: error._tag, scheduleExists: Option.isSome(schedule) },
        { tag: 'ItineraryNotFound', scheduleExists: false },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('A Schedule', () => {
  /** Option 1 after a Revision that changes everything a Schedule copies. */
  const revisedOption1: ItineraryContent = {
    ...option1WithEveryAttachment,
    birthdayOutline: 'A quiet birthday in Kanazawa.',
    stays: option1.stays.map((stay) => ({
      ...stay,
      accommodation: 'ryokan',
      highlights: ['Somewhere new'],
    })),
    days: option1.days.map((day) => ({ date: day.date })),
    moves: option1.moves.map((move) => Struct.omit(move, ['duration'])),
    dayTrips: [{ date: december(19), place: 'enoshima', optional: false }],
    verifyClaims: [],
    shigeharuVisit: { date: december(11), slot: 'afternoon' },
  }

  it.effect('reads nothing back from Itinerary content after a Revision', () =>
    Effect.gen(function* () {
      const chosen = yield* chooseOption1(firstChoose).pipe(
        Effect.andThen(currentSchedule),
        Effect.provide(trip),
      )
      const afterRevision = yield* currentSchedule.pipe(
        Effect.provide(tripWith([revisedOption1])),
      )
      assert.deepStrictEqual(afterRevision, chosen)
    }).pipe(Effect.provide(storage)),
  )
})
