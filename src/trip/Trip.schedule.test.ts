// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { assert, describe, it } from '@effect/vitest'
import {
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Struct,
} from 'effect'
import { TestClock } from 'effect/testing'

import { december, ScheduleNotFound } from '@/trip/domain'
import type {
  ItineraryContent,
  OperationId,
  ScheduleDetail,
  ScheduleId,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
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

const trip = tripWith([option1WithEveryAttachment, option2])

const firstChoose = '7d1f8c2e-4b6a-4f0e-9a3d-2c5b8e1f4a60' as OperationId
const secondChoose = 'c4e2a9b1-3f7d-4e8a-b6c0-9d1e5f2a7b38' as OperationId

/** The nth client-generated operation id of a test. */
const operation = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as OperationId

const chooseOption1 = (operationId: OperationId) =>
  Trip.use((trip) =>
    trip.choose({ operationId, optionNumber: 1, replacing: null }),
  )

/** Chooses an Itinerary, replacing the Schedule named, if any. */
const choose = (
  optionNumber: number,
  operationId: OperationId,
  replacing: ScheduleId | null,
) => Trip.use((trip) => trip.choose({ operationId, optionNumber, replacing }))

const setTime = (instant: string) =>
  TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)))

const archivedSchedules = Trip.use((trip) => trip.archivedSchedules)

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

  it.effect('names the current Schedule and the Itinerary it came from', () =>
    Effect.gen(function* () {
      const chosen = yield* chooseOption1(firstChoose)
      const summary = yield* Trip.use((trip) => trip.scheduleSummary)
      assert.deepStrictEqual(
        summary,
        Option.some({ id: chosen.scheduleId, sourceOptionNumber: 1 }),
      )
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
        trip.choose({
          operationId: firstChoose,
          optionNumber: 2,
          replacing: null,
        }),
      )
      assert.deepStrictEqual(
        { repeated, reworded, after: yield* currentSchedule },
        { repeated: first, reworded: first, after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a choose naming no Schedule while one is current', () =>
    Effect.gen(function* () {
      yield* chooseOption1(firstChoose)
      const before = yield* currentSchedule
      const error = yield* Effect.flip(chooseOption1(secondChoose))
      assert.deepStrictEqual(
        {
          tag: error._tag,
          after: yield* currentSchedule,
        },
        { tag: 'ScheduleChanged', after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with ItineraryNotFound and chooses nothing', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.choose({
            operationId: firstChoose,
            optionNumber: 99,
            replacing: null,
          }),
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

describe('Trip.choose again', () => {
  it.effect('archives the current Schedule and makes a fresh one current', () =>
    Effect.gen(function* () {
      yield* setTime('2026-10-01T09:30:00Z')
      const first = yield* choose(1, operation(1), null)
      yield* setTime('2026-10-03T12:00:00Z')
      const second = yield* choose(2, operation(2), first.scheduleId)
      const current = yield* currentSchedule
      assert.deepStrictEqual(
        {
          current: Struct.pick(current, [
            'id',
            'status',
            'sourceOptionNumber',
            'chosenAt',
          ]),
          archived: [...(yield* archivedSchedules)],
        },
        {
          current: {
            id: second.scheduleId,
            status: 'current',
            sourceOptionNumber: 2,
            chosenAt: '2026-10-03T12:00:00.000Z',
          },
          archived: [
            {
              id: first.scheduleId,
              sourceOptionNumber: 1,
              chosenAt: '2026-10-01T09:30:00.000Z',
              archivedAt: '2026-10-03T12:00:00.000Z',
            },
          ],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
  it.effect(
    'makes a fresh Schedule from the Itinerary the current one came from',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, operation(1), null)
        const before = yield* currentSchedule
        const second = yield* choose(1, operation(2), first.scheduleId)
        const after = yield* currentSchedule
        const stayIds = (schedule: typeof before) =>
          schedule.stays.map((stay) => stay.id)
        assert.deepStrictEqual(
          {
            fresh: second.scheduleId !== first.scheduleId,
            freshCopy: stayIds(after).some((id) =>
              stayIds(before).includes(id),
            ),
            sourceOptionNumber: after.sourceOptionNumber,
            days: withoutIds(after.days),
            archived: (yield* archivedSchedules).map(({ id }) => id),
          },
          {
            fresh: true,
            freshCopy: false,
            sourceOptionNumber: 1,
            days: withoutIds(before.days),
            archived: [first.scheduleId],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('copies a different Itinerary into the fresh Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      yield* choose(2, operation(2), first.scheduleId)
      const schedule = yield* currentSchedule
      const itinerary = yield* Trip.use((trip) => trip.itinerary(2))
      assert.deepStrictEqual(
        {
          sourceOptionNumber: schedule.sourceOptionNumber,
          birthdayOutline: schedule.birthdayOutline,
          copy: withoutIds({ stays: schedule.stays, days: schedule.days }),
          archived: (yield* archivedSchedules).map(({ id }) => id),
        },
        {
          sourceOptionNumber: 2,
          birthdayOutline: option2.birthdayOutline,
          copy: withoutIds({ stays: itinerary.stays, days: itinerary.days }),
          archived: [first.scheduleId],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('leaves the current Schedule current when it fails', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      const before = yield* currentSchedule
      const error = yield* Effect.flip(
        choose(99, operation(2), first.scheduleId),
      )
      assert.deepStrictEqual(
        {
          tag: error._tag,
          after: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { tag: 'ItineraryNotFound', after: before, archived: [] },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'archives nothing when storing the fresh Schedule fails part-way',
    () =>
      Effect.gen(function* () {
        // Two Days on one date can't be stored, so the copy fails after the
        // current Schedule has been archived in the same transaction.
        const unstorable: ItineraryContent = {
          ...option2,
          days: [...option2.days, ...option2.days.slice(0, 1)],
        }
        const state = Effect.all({
          current: currentSchedule,
          archived: archivedSchedules,
        })
        const { first, before } = yield* Effect.gen(function* () {
          const first = yield* choose(1, operation(1), null)
          return { first, before: yield* state }
        }).pipe(Effect.provide(trip))
        const exit = yield* Effect.exit(
          choose(2, operation(2), first.scheduleId).pipe(
            Effect.provide(tripWith([unstorable])),
          ),
        )
        assert.deepStrictEqual(
          {
            failed: Exit.isFailure(exit),
            after: yield* state.pipe(Effect.provide(trip)),
          },
          { failed: true, after: before },
        )
      }).pipe(Effect.provide(storage)),
  )

  it.effect('refuses a choose naming an archived Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      yield* choose(2, operation(2), first.scheduleId)
      const before = yield* currentSchedule
      const archivedBefore = yield* archivedSchedules
      const error = yield* Effect.flip(
        choose(1, operation(3), first.scheduleId),
      )
      assert.deepStrictEqual(
        {
          tag: error._tag,
          after: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { tag: 'ScheduleChanged', after: before, archived: archivedBefore },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

/** What a Schedule copied from its Itinerary, ids included. */
const copyOf = (schedule: ScheduleDetail) =>
  Struct.pick(schedule, ['birthdayOutline', 'verifyClaims', 'stays', 'days'])

describe('Trip.restore', () => {
  it.effect(
    'restores an archived Schedule after a Revision, with its original copy',
    () =>
      Effect.gen(function* () {
        const { first, original, second } = yield* Effect.gen(function* () {
          const first = yield* choose(1, operation(1), null)
          const original = yield* currentSchedule
          yield* setTime('2026-10-02T09:30:00Z')
          const second = yield* choose(2, operation(2), first.scheduleId)
          return { first, original, second }
        }).pipe(Effect.provide(trip))

        const afterRevision = yield* Effect.gen(function* () {
          const archived = yield* Trip.use((trip) =>
            trip.schedule(first.scheduleId),
          )
          const restored = yield* Trip.use((trip) =>
            trip.restore({
              operationId: operation(3),
              scheduleId: first.scheduleId,
              replacing: second.scheduleId,
            }),
          )
          return {
            archived,
            restored,
            current: yield* currentSchedule,
            archivedIds: (yield* archivedSchedules).map(({ id }) => id),
          }
        }).pipe(Effect.provide(tripWith([revisedOption1, option2])))

        const { archived, restored, current, archivedIds } = afterRevision
        assert.deepStrictEqual(
          {
            archived: {
              status: archived.status,
              archivedAt: archived.archivedAt,
              ...copyOf(archived),
            },
            restored,
            current: {
              id: current.id,
              status: current.status,
              archivedAt: current.archivedAt,
              ...copyOf(current),
            },
            archivedIds,
          },
          {
            archived: {
              status: 'archived',
              archivedAt: '2026-10-02T09:30:00.000Z',
              ...copyOf(original),
            },
            restored: { scheduleId: first.scheduleId },
            current: {
              id: first.scheduleId,
              status: 'current',
              archivedAt: null,
              ...copyOf(original),
            },
            archivedIds: [second.scheduleId],
          },
        )
      }).pipe(Effect.provide(storage)),
  )

  it.effect('returns the recorded result when an operation id repeats', () =>
    Effect.gen(function* () {
      yield* setTime('2026-10-01T09:00:00Z')
      const first = yield* choose(1, operation(1), null)
      yield* setTime('2026-10-02T09:00:00Z')
      const second = yield* choose(2, operation(2), first.scheduleId)
      yield* setTime('2026-10-03T09:00:00Z')
      const restore = (replacing: ScheduleId) =>
        Trip.use((trip) =>
          trip.restore({
            operationId: operation(3),
            scheduleId: first.scheduleId,
            replacing,
          }),
        )
      const restored = yield* restore(second.scheduleId)
      yield* setTime('2026-10-04T09:00:00Z')
      const third = yield* choose(1, operation(4), first.scheduleId)
      const before = {
        current: yield* currentSchedule,
        archived: yield* archivedSchedules,
      }
      yield* setTime('2026-10-05T09:00:00Z')
      const repeated = yield* restore(third.scheduleId)
      assert.deepStrictEqual(
        {
          repeated,
          current: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { repeated: restored, ...before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a restore naming an archived Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      const second = yield* choose(2, operation(2), first.scheduleId)
      yield* choose(1, operation(3), second.scheduleId)
      const before = {
        current: yield* currentSchedule,
        archived: yield* archivedSchedules,
      }
      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.restore({
            operationId: operation(4),
            scheduleId: first.scheduleId,
            replacing: second.scheduleId,
          }),
        ),
      )
      assert.deepStrictEqual(
        {
          tag: error._tag,
          current: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { tag: 'ScheduleChanged', ...before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with ScheduleNotFound for an unknown Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      const unknown = '00000000-0000-4000-8000-ffffffffffff' as ScheduleId
      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.restore({
            operationId: operation(2),
            scheduleId: unknown,
            replacing: first.scheduleId,
          }),
        ),
      )
      const current = yield* currentSchedule
      assert.deepStrictEqual(
        { error, current: current.id },
        {
          error: new ScheduleNotFound({ scheduleId: unknown }),
          current: first.scheduleId,
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.schedule', () => {
  it.effect('fails with ScheduleNotFound for an unknown Schedule', () =>
    Effect.gen(function* () {
      const unknown = '00000000-0000-4000-8000-ffffffffffff' as ScheduleId
      const error = yield* Effect.flip(
        Trip.use((trip) => trip.schedule(unknown)),
      )
      assert.deepStrictEqual(
        error,
        new ScheduleNotFound({ scheduleId: unknown }),
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('The Revision notice', () => {
  /** The current Schedule's source Itinerary status, read under content. */
  const statusUnder = (contents: ReadonlyArray<ItineraryContent>) =>
    currentSchedule.pipe(
      Effect.map((schedule) => schedule.sourceItinerary),
      Effect.provide(tripWith(contents)),
    )

  const chooseFromOption1 = chooseOption1(firstChoose).pipe(
    Effect.provide(trip),
  )

  it.effect('is absent while the source Itinerary is unchanged', () =>
    Effect.gen(function* () {
      yield* chooseFromOption1
      assert.strictEqual(
        yield* statusUnder([option1WithEveryAttachment, option2]),
        'unchanged',
      )
    }).pipe(Effect.provide(storage)),
  )

  it.effect('shows once the source Itinerary has had a Revision', () =>
    Effect.gen(function* () {
      yield* chooseFromOption1
      assert.strictEqual(
        yield* statusUnder([revisedOption1, option2]),
        'revised',
      )
    }).pipe(Effect.provide(storage)),
  )

  it.effect('says no longer available once the source Itinerary is gone', () =>
    Effect.gen(function* () {
      yield* chooseFromOption1
      assert.strictEqual(yield* statusUnder([option2]), 'unavailable')
    }).pipe(Effect.provide(storage)),
  )
})

describe('A Schedule', () => {
  it.effect('reads nothing back from Itinerary content after a Revision', () =>
    Effect.gen(function* () {
      const chosen = yield* chooseOption1(firstChoose).pipe(
        Effect.andThen(currentSchedule),
        Effect.provide(trip),
      )
      const afterRevision = yield* currentSchedule.pipe(
        Effect.provide(tripWith([revisedOption1])),
      )
      assert.deepStrictEqual(
        Struct.omit(afterRevision, ['sourceItinerary']),
        Struct.omit(chosen, ['sourceItinerary']),
      )
    }).pipe(Effect.provide(storage)),
  )
})
