// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
// How Schedules are stored, row by row, with each write's operation id and
// result. Only the Trip service uses it, inside the Durable Object or over
// Node's SQLite in the tests; tables stay behind it.
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { Statement } from 'effect/sql'

import {
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

/**
 * Everything a Schedule copies from the Itinerary chosen, each Stay, Move, Day
 * trip, Verify claim and Anchor with its own id.
 */
export interface ScheduleCopy {
  readonly stays: ReadonlyArray<Copied<Stay>>
  readonly days: ReadonlyArray<Day>
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

/** The storage operations, over the SQL client in context. */
export const scheduleStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const insertInto = (table: string) => (row: Record<string, unknown>) =>
    sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`
  const inserter = <S extends Schema.Encoder<Record<string, unknown>>>(
    table: string,
    Request: S,
  ) => SqlSchema.void({ Request, execute: insertInto(table) })

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
      days: days.map(({ date, description }) => ({
        date,
        ...(description !== null && { description }),
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

  return {
    /** Runs storage operations as one transaction. */
    transaction: sql.withTransaction,

    /** The current Schedule's own fields, if there is one. */
    currentRecord: findCurrent(undefined),

    /** The current Schedule with its copy, if there is one. */
    current: findCurrent(undefined).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (schedule) =>
            Effect.map(findCopy(schedule.id), (copy) =>
              Option.some({ schedule, copy }),
            ),
        }),
      ),
    ),

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
