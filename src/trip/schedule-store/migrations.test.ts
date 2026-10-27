// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient } from '@effect/sql-sqlite-node'
import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Struct } from 'effect'
import type { Schema } from 'effect'
import { Migrator, SqlClient } from 'effect/sql'
import type { SqlError } from 'effect/sql'

import {
  ChecklistItem,
  december,
  Hotel,
  ScheduleId,
} from '@/trip/domain/domain'
import { Itinerary } from '@/trip/itinerary/Itinerary'
import { option1 } from '@/trip/itinerary/option-1'
import { migrations } from '@/trip/schedule-store/migrations'
import { operation, testTrip } from '@/trip/trip/testing'
import { copyOf, Trip } from '@/trip/trip/Trip'
import { startStore } from '@/trip/trip-store/store-start'

/*
 * The one test that reaches past the Trip (the agreed exception): its setup
 * writes Schedules in the shape the shipped migrations left them, with SQL,
 * then starts the store as the Durable Object does and reads through the Trip.
 */

const shippedMigrations = Effect.map(migrations, (all) =>
  all.filter(([id]) => id <= 9),
)

const currentId = ScheduleId.make('6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b')

const archivedId = ScheduleId.make('0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d')

interface Entered {
  readonly kyotoHotel: string
  readonly kyotoNote: string
  readonly dayNotes: Readonly<Record<string, string>>
  readonly activityOn: string
}

/** Writes a Schedule copied from the Itinerary with SQL, as the shipped migrations stored it. */
const insertScheduleAsShipped = Effect.fnUntraced(function* (
  id: ScheduleId,
  status: 'current' | 'archived',
  entered: Entered,
) {
  const sql = yield* SqlClient.SqlClient
  const copy = copyOf(option1)
  const scheduleId = id

  const rowsIn = (table: string, rows: ReadonlyArray<Schema.JsonObject>) =>
    sql`INSERT INTO ${sql(table)} ${sql.insert(rows)}`

  yield* rowsIn('schedules', [
    {
      id,
      status,
      sourceOptionNumber: 1,
      sourceContentVersion: 'shipped',
      chosenAt: '2026-10-06T09:00:00.000Z',
      archivedAt: status === 'archived' ? '2026-10-07T09:00:00.000Z' : null,
      birthdayOutline: option1.birthdayOutline,
    },
  ])
  yield* rowsIn(
    'stays',
    copy.stays.map((stay) => ({
      ...Struct.omit(stay, ['hotel']),
      scheduleId,
      highlights: JSON.stringify(stay.highlights),
      note: stay.base === 'kyoto' ? entered.kyotoNote : null,
      hotelName: stay.base === 'kyoto' ? entered.kyotoHotel : null,
    })),
  )
  yield* rowsIn(
    'days',
    copy.days.map(({ date, description }) => ({
      scheduleId,
      date,
      description: description ?? null,
      note: entered.dayNotes[date] ?? null,
    })),
  )
  yield* rowsIn(
    'moves',
    copy.moves.map(({ sections, duration, ...move }) => ({
      ...move,
      scheduleId,
      sections: JSON.stringify(sections),
      duration: duration === undefined ? null : JSON.stringify(duration),
    })),
  )
  yield* rowsIn(
    'dayTrips',
    copy.dayTrips.map((dayTrip, position) => ({
      ...dayTrip,
      scheduleId,
      position,
      optional: dayTrip.optional ? 1 : 0,
    })),
  )
  yield* rowsIn(
    'verifyClaims',
    copy.verifyClaims.map(({ attachedTo, ...claim }, position) => ({
      ...claim,
      scheduleId,
      position,
      attachedTo: JSON.stringify(attachedTo),
    })),
  )
  yield* rowsIn(
    'anchors',
    copy.anchors.map((anchor, position) => ({
      id: anchor.id,
      scheduleId,
      position,
      anchor: JSON.stringify(anchor),
    })),
  )
  yield* rowsIn('activities', [
    {
      id: crypto.randomUUID(),
      scheduleId,
      date: entered.activityOn,
      position: 0,
      title: 'Nishiki Market',
    },
  ])

  const kyoto = copy.stays.find((stay) => stay.base === 'kyoto')
  yield* rowsIn('checklistTicks', [{ scheduleId, itemId: kyoto?.id ?? '' }])
  yield* rowsIn('operations', [
    { id: crypto.randomUUID(), result: JSON.stringify({ scheduleId: id }) },
  ])
})

/** A store holding what the setup wrote, started as the Durable Object starts it. */
const startedAfter = (
  setup: Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient>,
) =>
  Layer.effectDiscard(
    Migrator.make({})({ loader: shippedMigrations }).pipe(
      Effect.andThen(setup),
      Effect.andThen(startStore),
    ),
  ).pipe(
    Layer.provide(Itinerary.fromContent(option1)),
    Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
  )

/** An Activity Phillip added before the migration, recorded as operation 1. */
const recordedActivityId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'

const activityRecordedAsShipped = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO operations ${sql.insert({
    id: operation(1),
    result: JSON.stringify({ activityId: recordedActivityId }),
  })}`
})

const entered: Entered = {
  kyotoHotel: 'Hotel Kanra Kyoto',
  kyotoNote: 'Ask for a quiet room.',
  dayNotes: { [december(10)]: 'Early start for Fushimi Inari.' },
  activityOn: december(12),
}

/** What Phillip sees of his Schedule and what he entered in it. */
const whatPhillipSees = Effect.gen(function* () {
  const { current } = yield* Trip.use((trip) => trip.schedules)
  const checklist = yield* Trip.use((trip) => trip.checklist)

  return {
    id: current.id,
    stays: current.stays.map((stay) => ({
      base: stay.base.id,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      note: stay.note,
      hotel: stay.hotel,
    })),
    notes: current.days.flatMap(({ date, note }) =>
      note === undefined ? [] : [{ date, note }],
    ),
    activities: current.days.flatMap(({ date, activities }) =>
      activities.map(({ title }) => ({ date, title })),
    ),
    ticked: checklist.items.flatMap((item) =>
      item.ticked && ChecklistItem.guards.BookHotel(item)
        ? [item.stay.base.id]
        : [],
    ),
  }
})

const expectedStays = option1.stays.map((stay) => ({
  base: stay.base,
  checkIn: stay.checkIn,
  checkOut: stay.checkOut,
  note: stay.base === 'kyoto' ? entered.kyotoNote : undefined,
  hotel:
    stay.base === 'kyoto'
      ? Hotel.cases.Recorded.make({ name: entered.kyotoHotel })
      : Hotel.cases.NotRecorded.make({}),
}))

describe('Migrating to one Schedule', () => {
  it.effect(
    'keeps the current Schedule whole, its Birthday outline now the December 15 Day note',
    () =>
      Effect.gen(function* () {
        const seen = yield* whatPhillipSees

        assert.deepStrictEqual(seen, {
          id: currentId,
          stays: expectedStays,
          notes: [
            { date: december(10), note: 'Early start for Fushimi Inari.' },
            { date: december(15), note: option1.birthdayOutline },
          ],
          activities: [{ date: december(12), title: 'Nishiki Market' }],
          ticked: ['kyoto'],
        })
      }).pipe(
        Effect.provide([
          testTrip,
          startedAfter(
            Effect.andThen(
              insertScheduleAsShipped(archivedId, 'archived', {
                kyotoHotel: 'An archived hotel',
                kyotoNote: 'An archived note.',
                dayNotes: { [december(15)]: 'An archived birthday.' },
                activityOn: december(7),
              }),
              insertScheduleAsShipped(currentId, 'current', entered),
            ),
          ),
        ]),
      ),
  )

  it.effect(
    'started again, keeps the one Schedule with the same id and what Phillip entered',
    () =>
      Effect.gen(function* () {
        const before = yield* whatPhillipSees
        yield* startStore.pipe(Effect.provide(Itinerary.fromContent(option1)))
        const after = yield* whatPhillipSees

        assert.deepStrictEqual(after, { ...before, id: currentId })
      }).pipe(
        Effect.provide([
          testTrip,
          startedAfter(insertScheduleAsShipped(currentId, 'current', entered)),
        ]),
      ),
  )

  it.effect('leaves a December 15 Day note Phillip wrote as it is', () =>
    Effect.gen(function* () {
      const { notes } = yield* whatPhillipSees

      assert.deepStrictEqual(notes, [
        { date: december(10), note: 'Early start for Fushimi Inari.' },
        { date: december(15), note: 'Dinner at 19:00.' },
      ])
    }).pipe(
      Effect.provide([
        testTrip,
        startedAfter(
          insertScheduleAsShipped(currentId, 'current', {
            ...entered,
            dayNotes: {
              ...entered.dayNotes,
              [december(15)]: 'Dinner at 19:00.',
            },
          }),
        ),
      ]),
    ),
  )

  it.effect(
    'returns the result recorded before the migration when the operation repeats, writing nothing',
    () =>
      Effect.gen(function* () {
        const before = yield* whatPhillipSees

        const replayed = yield* Trip.use((trip) =>
          trip.addActivity({
            operationId: operation(1),
            date: december(14),
            title: 'Walk Gion',
          }),
        )

        assert.deepStrictEqual(replayed, { activityId: recordedActivityId })
        assert.deepStrictEqual(yield* whatPhillipSees, before)
      }).pipe(
        Effect.provide([
          testTrip,
          startedAfter(
            Effect.andThen(
              insertScheduleAsShipped(currentId, 'current', entered),
              activityRecordedAsShipped,
            ),
          ),
        ]),
      ),
  )
})
