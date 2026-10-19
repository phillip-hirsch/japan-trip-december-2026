// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient } from 'effect/sql'

import {
  ArchivedScheduleSummary,
  CopyId,
  DayTrip,
  IsoDate,
  IsoInstant,
  OperationId,
  ScheduleAnchor,
  ScheduleId,
  ScheduleRecord,
} from '@/trip/domain'
import type { ScheduleCopy } from '@/trip/schedule-copy'
import {
  activityCopyQueries,
  activityOf,
  activityRowOf,
} from '@/trip/schedule-store.activities'
import {
  ofSchedule,
  ordered,
  sharedQueries,
} from '@/trip/schedule-store.shared'
import {
  hotelColumns,
  hotelOf,
  stayCopyQueries,
} from '@/trip/schedule-store.stays'

const DayRow = Schema.Struct({
  ...ofSchedule,
  date: IsoDate,
  description: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
})

const DayTripRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...ordered,
  ...DayTrip.fields,
  optional: Schema.BooleanFromBit,
})

const AnchorRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...ordered,
  anchor: Schema.fromJsonString(ScheduleAnchor),
})

/**
 * The Schedules with their copies, the transactions writes run in and the
 * recorded results of operations.
 */
export const scheduleQueries = (sql: SqlClient.SqlClient) => {
  const { insertInto, inserter, rowsOf } = sharedQueries(sql)

  const { findActivities, insertActivity } = activityCopyQueries(sql)

  const {
    findStays,
    findMoves,
    findVerifyClaims,
    inserting,
    writeStayChanges,
  } = stayCopyQueries(sql)

  const insertSchedule = inserter('schedules', ScheduleRecord)
  const insertDay = inserter('days', DayRow)
  const insertDayTrip = inserter('dayTrips', DayTripRow)
  const insertAnchor = inserter('anchors', AnchorRow)

  const findCurrent = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: ScheduleRecord,
    execute: () => sql`SELECT * FROM schedules WHERE status = 'current'`,
  })

  const findById = SqlSchema.findOneOption({
    Request: ScheduleId,
    Result: ScheduleRecord,
    execute: (id) => sql`SELECT * FROM schedules WHERE id = ${id}`,
  })

  const findArchived = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ArchivedScheduleSummary,
    execute: () =>
      sql`
        SELECT id, sourceOptionNumber, chosenAt, archivedAt FROM schedules
        WHERE status = 'archived' ORDER BY archivedAt DESC
      `,
  })

  const archiveSchedule = SqlSchema.void({
    Request: Schema.Struct({ id: ScheduleId, archivedAt: IsoInstant }),
    execute: ({ id, archivedAt }) =>
      sql`
        UPDATE schedules SET status = 'archived', archivedAt = ${archivedAt}
        WHERE id = ${id}
      `,
  })

  const makeScheduleCurrent = SqlSchema.void({
    Request: ScheduleId,
    execute: (id) =>
      sql`
        UPDATE schedules SET status = 'current', archivedAt = NULL
        WHERE id = ${id}
      `,
  })

  const findDay = SqlSchema.findOneOption({
    Request: Schema.Struct({ scheduleId: ScheduleId, date: IsoDate }),
    Result: Schema.Struct({ date: IsoDate }),
    execute: ({ scheduleId, date }) =>
      sql`SELECT date FROM days WHERE scheduleId = ${scheduleId} AND date = ${date}`,
  })

  const findDays = rowsOf(
    DayRow,
    (id) => sql`SELECT * FROM days WHERE scheduleId = ${id} ORDER BY date`,
  )

  const findDayTrips = rowsOf(
    DayTripRow,
    (id) =>
      sql`SELECT * FROM dayTrips WHERE scheduleId = ${id} ORDER BY position`,
  )

  const findAnchors = rowsOf(
    AnchorRow,
    (id) =>
      sql`SELECT * FROM anchors WHERE scheduleId = ${id} ORDER BY position`,
  )

  const withoutSchedule = <A extends { readonly scheduleId: string }>(row: A) =>
    Struct.omit(row, ['scheduleId'])

  const findCopy = Effect.fnUntraced(function* (scheduleId: ScheduleId) {
    const [stays, days, moves, dayTrips, verifyClaims, anchors, activities] =
      yield* Effect.all([
        findStays(scheduleId),
        findDays(scheduleId),
        findMoves(scheduleId),
        findDayTrips(scheduleId),
        findVerifyClaims(scheduleId),
        findAnchors(scheduleId),
        findActivities(scheduleId),
      ])

    const copy: ScheduleCopy = {
      stays: stays.map(({ note, ...row }) => ({
        ...withoutSchedule(Struct.omit(row, hotelColumns)),
        ...(note !== null && { note }),
        hotel: hotelOf(row),
      })),
      days: days.map(({ date, description, note }) => ({
        date,
        ...(description !== null && { description }),
        ...(note !== null && { note }),
        activities: activities
          .filter((activity) => activity.date === date)
          .map(activityOf),
      })),
      moves: moves.map(({ duration, ...move }) => ({
        ...withoutSchedule(move),
        ...(duration !== null && { duration }),
      })),
      dayTrips: dayTrips.map((row) =>
        Struct.omit(row, ['scheduleId', 'position']),
      ),
      verifyClaims: verifyClaims.map((row) =>
        Struct.omit(row, ['scheduleId', 'position']),
      ),
      anchors: anchors.map((row) => row.anchor),
    }

    return copy
  })

  const withCopy = <E, R>(
    found: Effect.Effect<Option.Option<ScheduleRecord>, E, R>,
  ) =>
    found.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (schedule) =>
            Effect.map(findCopy(schedule.id), (copy) =>
              Option.some({ schedule, copy }),
            ),
        }),
      ),
    )

  return {
    transaction: sql.withTransaction,

    currentRecord: findCurrent(undefined),

    current: withCopy(findCurrent(undefined)),

    recordById: findById,

    scheduleById: (id: ScheduleId) => withCopy(findById(id)),

    /** Every archived Schedule, the most recently archived first. */
    archived: findArchived(undefined),

    archive: (id: ScheduleId, archivedAt: IsoInstant) =>
      archiveSchedule({ id, archivedAt }),

    makeCurrent: makeScheduleCurrent,

    hasDay: (scheduleId: ScheduleId, date: IsoDate) =>
      Effect.map(findDay({ scheduleId, date }), Option.isSome),

    /**
     * Stores a new Schedule with its copy, its Activities included, one row
     * per statement to stay well under any limit on bound parameters.
     */
    insert: Effect.fnUntraced(function* (
      schedule: ScheduleRecord,
      copy: ScheduleCopy,
    ) {
      const scheduleId = schedule.id
      yield* insertSchedule(schedule)
      yield* writeStayChanges(scheduleId, copy, inserting)
      yield* Effect.forEach(
        copy.days,
        (day) =>
          insertDay({
            scheduleId,
            date: day.date,
            description: day.description ?? null,
            note: day.note ?? null,
          }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.dayTrips,
        (dayTrip, position) =>
          insertDayTrip({ ...dayTrip, scheduleId, position }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.days.flatMap(({ date, activities }) =>
          activities.map((activity, position) =>
            activityRowOf(scheduleId, date, activity, position),
          ),
        ),
        insertActivity,
        { discard: true },
      )
      yield* Effect.forEach(
        copy.anchors,
        (anchor, position) =>
          insertAnchor({ id: anchor.id, scheduleId, position, anchor }),
        { discard: true },
      )
    }),

    recordedResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.findOneOption({
        Request: OperationId,
        Result: Schema.Struct({ result: Schema.fromJsonString(Result) }),
        execute: (id) => sql`SELECT result FROM operations WHERE id = ${id}`,
      }),

    recordResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.void({
        Request: Schema.Struct({
          id: OperationId,
          result: Schema.fromJsonString(Result),
        }),
        execute: insertInto('operations'),
      }),
  }
}
