// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
// How Schedules are stored, row by row, with each write's operation id and
// result. Only the Trip service uses it, inside the Durable Object or over
// Node's SQLite in the tests; tables stay behind it.
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { Statement } from 'effect/sql'

import {
  ArchivedScheduleSummary,
  CopyId,
  DayTrip,
  DurationRange,
  IsoDate,
  Move,
  OperationId,
  ScheduleAnchor,
  ScheduleId,
  ScheduleRecord,
  Stay,
  VerifyClaim,
  VerifyClaimAttachment,
} from '@/trip/domain'
import type { Day } from '@/trip/domain'

type Copied<A> = A & { readonly id: string }

/** A Day of a Schedule, with Phillip's Day note once he writes one. */
export type ScheduleDay = Day & { readonly note?: string }

/**
 * Everything a Schedule copies from the Itinerary chosen, each Stay, Move, Day
 * trip, Verify claim and Anchor with its own id, and Phillip's Day notes.
 */
export interface ScheduleCopy {
  readonly stays: ReadonlyArray<Copied<Stay>>
  readonly days: ReadonlyArray<ScheduleDay>
  readonly moves: ReadonlyArray<Copied<Move>>
  readonly dayTrips: ReadonlyArray<Copied<DayTrip>>
  readonly verifyClaims: ReadonlyArray<VerifyClaim>
  readonly anchors: ReadonlyArray<ScheduleAnchor>
}

// Rows: lists and unions are stored as JSON, and lists of entities keep the
// Itinerary's order by position.
const ofSchedule = { scheduleId: ScheduleId }

const ordered = { position: Schema.Int }

const StayRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...Stay.fields,
  highlights: Schema.fromJsonString(Stay.fields.highlights),
})

const DayRow = Schema.Struct({
  ...ofSchedule,
  date: IsoDate,
  description: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
})

const MoveRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  date: IsoDate,
  mode: Move.fields.mode,
  sections: Schema.fromJsonString(Move.fields.sections),
  duration: Schema.NullOr(Schema.fromJsonString(DurationRange)),
})

const DayTripRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...ordered,
  ...DayTrip.fields,
  optional: Schema.BooleanFromBit,
})

const VerifyClaimRow = Schema.Struct({
  ...ofSchedule,
  ...ordered,
  ...VerifyClaim.fields,
  attachedTo: Schema.fromJsonString(VerifyClaimAttachment),
})

const AnchorRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...ordered,
  anchor: Schema.fromJsonString(ScheduleAnchor),
})

export type ScheduleStore = Effect.Success<typeof scheduleStore>

/** The storage operations, over the SQL client in context. */
export const scheduleStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const insertInto = (table: string) => (row: Schema.JsonObject) =>
    sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`

  const inserter = <S extends Schema.Encoder<Schema.JsonObject>>(
    table: string,
    Request: S,
  ) =>
    SqlSchema.void({
      Request,
      execute: insertInto(table),
    })

  const insertSchedule = inserter('schedules', ScheduleRecord)
  const insertStay = inserter('stays', StayRow)
  const insertDay = inserter('days', DayRow)
  const insertMove = inserter('moves', MoveRow)
  const insertDayTrip = inserter('dayTrips', DayTripRow)
  const insertVerifyClaim = inserter('verifyClaims', VerifyClaimRow)
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
    Request: Schema.Struct({ id: ScheduleId, archivedAt: Schema.String }),
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

  const updateDayNote = SqlSchema.void({
    Request: Schema.Struct({
      scheduleId: ScheduleId,
      date: IsoDate,
      note: Schema.NullOr(Schema.String),
    }),
    execute: ({ scheduleId, date, note }) =>
      sql`
        UPDATE days SET note = ${note}
        WHERE scheduleId = ${scheduleId} AND date = ${date}
      `,
  })

  const rowsOf = <S extends Schema.Top>(
    Result: S,
    execute: (scheduleId: string) => Statement.Statement<unknown>,
  ) => SqlSchema.findAll({ Request: ScheduleId, Result, execute })

  const findStays = rowsOf(
    StayRow,
    (id) => sql`SELECT * FROM stays WHERE scheduleId = ${id} ORDER BY checkIn`,
  )

  const findDays = rowsOf(
    DayRow,
    (id) => sql`SELECT * FROM days WHERE scheduleId = ${id} ORDER BY date`,
  )

  const findMoves = rowsOf(
    MoveRow,
    (id) => sql`SELECT * FROM moves WHERE scheduleId = ${id} ORDER BY date`,
  )

  const findDayTrips = rowsOf(
    DayTripRow,
    (id) =>
      sql`SELECT * FROM dayTrips WHERE scheduleId = ${id} ORDER BY position`,
  )

  const findVerifyClaims = rowsOf(
    VerifyClaimRow,
    (id) =>
      sql`SELECT * FROM verifyClaims WHERE scheduleId = ${id} ORDER BY position`,
  )

  const findAnchors = rowsOf(
    AnchorRow,
    (id) =>
      sql`SELECT * FROM anchors WHERE scheduleId = ${id} ORDER BY position`,
  )

  const withoutSchedule = <A extends { readonly scheduleId: string }>(row: A) =>
    Struct.omit(row, ['scheduleId'])

  /** A Schedule's copy, read back from its rows alone. */
  const findCopy = Effect.fnUntraced(function* (scheduleId: ScheduleId) {
    const [stays, days, moves, dayTrips, verifyClaims, anchors] =
      yield* Effect.all([
        findStays(scheduleId),
        findDays(scheduleId),
        findMoves(scheduleId),
        findDayTrips(scheduleId),
        findVerifyClaims(scheduleId),
        findAnchors(scheduleId),
      ])

    const copy: ScheduleCopy = {
      stays: stays.map(withoutSchedule),
      days: days.map(({ date, description, note }) => ({
        date,
        ...(description !== null && { description }),
        ...(note !== null && { note }),
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

  /** A Schedule found by its own fields, with its copy. */
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
    /** Runs storage operations as one transaction. */
    transaction: sql.withTransaction,

    /** The current Schedule's own fields, if there is one. */
    currentRecord: findCurrent(undefined),

    /** The current Schedule with its copy, if there is one. */
    current: withCopy(findCurrent(undefined)),

    /** A Schedule's own fields, current or archived, if it exists. */
    recordById: findById,

    /** A Schedule with its copy, current or archived, if it exists. */
    scheduleById: (id: ScheduleId) => withCopy(findById(id)),

    /** Every archived Schedule, the most recently archived first. */
    archived: findArchived(undefined),

    /** Archives a Schedule at a moment, given as an ISO 8601 UTC string. */
    archive: (id: ScheduleId, archivedAt: string) =>
      archiveSchedule({ id, archivedAt }),

    /** Makes an archived Schedule current again. */
    makeCurrent: makeScheduleCurrent,

    /** Whether a Schedule has a Day on a date. */
    hasDay: (scheduleId: ScheduleId, date: IsoDate) =>
      Effect.map(findDay({ scheduleId, date }), Option.isSome),

    /** Replaces the Day note on a Day of a Schedule; empty removes it. */
    writeDayNote: (scheduleId: ScheduleId, date: IsoDate, note: string) =>
      updateDayNote({ scheduleId, date, note: note === '' ? null : note }),

    /**
     * Stores a new Schedule with its copy, one row per statement to stay well
     * under any limit on bound parameters.
     */
    insert: Effect.fnUntraced(function* (
      schedule: ScheduleRecord,
      copy: ScheduleCopy,
    ) {
      const scheduleId = schedule.id
      yield* insertSchedule(schedule)
      yield* Effect.forEach(
        copy.stays,
        (stay) => insertStay({ ...stay, scheduleId }),
        { discard: true },
      )
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
        copy.moves,
        (move) =>
          insertMove({
            ...Struct.omit(move, ['duration']),
            scheduleId,
            duration: move.duration ?? null,
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
        copy.verifyClaims,
        (claim, position) =>
          insertVerifyClaim({ ...claim, scheduleId, position }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.anchors,
        (anchor, position) =>
          insertAnchor({ id: anchor.id, scheduleId, position, anchor }),
        { discard: true },
      )
    }),

    /** The result recorded with an operation id, if it has run. */
    recordedResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.findOneOption({
        Request: OperationId,
        Result: Schema.Struct({ result: Schema.fromJsonString(Result) }),
        execute: (id) => sql`SELECT result FROM operations WHERE id = ${id}`,
      }),

    /** Records an operation id with its result. */
    recordResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.void({
        Request: Schema.Struct({
          id: OperationId,
          result: Schema.fromJsonString(Result),
        }),
        execute: insertInto('operations'),
      }),
  }
})
