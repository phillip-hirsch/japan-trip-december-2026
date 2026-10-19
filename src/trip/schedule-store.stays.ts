// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient, Statement } from 'effect/sql'

import {
  CopyId,
  DurationRange,
  Hotel,
  IsoDate,
  Move,
  ScheduleId,
  Stay,
  VerifyClaim,
  VerifyClaimAttachment,
} from '@/trip/domain'
import type { HotelDetails } from '@/trip/domain'
import type { AppliedStayEdit, StayChanges } from '@/trip/schedule-copy'
import {
  PinColumns,
  pinColumnsOf,
  pinOf,
} from '@/trip/schedule-store.activities'
import {
  ofSchedule,
  ordered,
  sharedQueries,
} from '@/trip/schedule-store.shared'

const StayRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...Stay.fields,
  highlights: Schema.fromJsonString(Stay.fields.highlights),
  note: Schema.NullOr(Schema.String),
  hotelName: Schema.NullOr(Schema.String),
  hotelAddress: Schema.NullOr(Schema.String),
  hotelConfirmationNumber: Schema.NullOr(Schema.String),
  ...PinColumns.fields,
})

export const hotelColumns = [
  'hotelName',
  'hotelAddress',
  'hotelConfirmationNumber',
  'pinLatitude',
  'pinLongitude',
  'pinLink',
] as const

const hotelColumnsOf = (details: HotelDetails) => ({
  hotelName: details.name ?? null,
  hotelAddress: details.address ?? null,
  hotelConfirmationNumber: details.confirmationNumber ?? null,
})

export const hotelOf = ({
  hotelName,
  hotelAddress,
  hotelConfirmationNumber,
  ...pinColumns
}: ReturnType<typeof hotelColumnsOf> & PinColumns): Hotel => {
  const pin = pinOf(pinColumns)

  return hotelName === null &&
    hotelAddress === null &&
    hotelConfirmationNumber === null &&
    pin === undefined
    ? Hotel.cases.NotRecorded.make({})
    : Hotel.cases.Recorded.make({
        ...(hotelName !== null && { name: hotelName }),
        ...(hotelAddress !== null && { address: hotelAddress }),
        ...(hotelConfirmationNumber !== null && {
          confirmationNumber: hotelConfirmationNumber,
        }),
        ...(pin && { pin }),
      })
}

const MoveRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  date: IsoDate,
  mode: Move.fields.mode,
  sections: Schema.fromJsonString(Move.fields.sections),
  duration: Schema.NullOr(Schema.fromJsonString(DurationRange)),
})

const VerifyClaimRow = Schema.Struct({
  ...ofSchedule,
  ...ordered,
  ...VerifyClaim.fields,
  attachedTo: Schema.fromJsonString(VerifyClaimAttachment),
})

/** The Stays, Moves and Verify claims of a Schedule copy, read and written. */
export const stayCopyQueries = (sql: SqlClient.SqlClient) => {
  const { insertInto, rowsOf } = sharedQueries(sql)

  const findStays = rowsOf(
    StayRow,
    (id) => sql`SELECT * FROM stays WHERE scheduleId = ${id} ORDER BY checkIn`,
  )

  const findMoves = rowsOf(
    MoveRow,
    (id) => sql`SELECT * FROM moves WHERE scheduleId = ${id} ORDER BY date`,
  )

  const findVerifyClaims = rowsOf(
    VerifyClaimRow,
    (id) =>
      sql`SELECT * FROM verifyClaims WHERE scheduleId = ${id} ORDER BY position`,
  )

  const upsertInto = (table: string) => (row: Schema.JsonObject) =>
    sql`
      INSERT INTO ${sql(table)} ${sql.insert(row)}
      ON CONFLICT (id) DO UPDATE SET ${sql.update(row, ['id', 'scheduleId'])}
      WHERE ${sql(table)}.scheduleId = excluded.scheduleId
    `

  const stayChangeWriters = (
    write: (
      table: string,
    ) => (row: Schema.JsonObject) => Statement.Statement<unknown>,
  ) => ({
    stay: SqlSchema.void({ Request: StayRow, execute: write('stays') }),
    move: SqlSchema.void({ Request: MoveRow, execute: write('moves') }),
    verifyClaim: SqlSchema.void({
      Request: VerifyClaimRow,
      execute: write('verifyClaims'),
    }),
  })

  const inserting = stayChangeWriters(insertInto)

  const upserting = stayChangeWriters(upsertInto)

  const writeStayChanges = Effect.fnUntraced(function* (
    scheduleId: ScheduleId,
    { stays, moves, verifyClaims }: StayChanges,
    writers: ReturnType<typeof stayChangeWriters>,
  ) {
    yield* Effect.forEach(
      stays,
      ({ hotel, ...stay }) =>
        writers.stay({
          ...stay,
          scheduleId,
          note: stay.note ?? null,
          ...hotelColumnsOf(Hotel.guards.Recorded(hotel) ? hotel : {}),
          ...pinColumnsOf(Hotel.guards.Recorded(hotel) ? hotel.pin : undefined),
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      moves,
      (move) =>
        writers.move({
          ...Struct.omit(move, ['duration']),
          scheduleId,
          duration: move.duration ?? null,
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      verifyClaims,
      (claim, position) =>
        writers.verifyClaim({ ...claim, scheduleId, position }),
      { discard: true },
    )
  })

  return {
    findStays,
    findMoves,
    findVerifyClaims,
    inserting,
    upserting,
    writeStayChanges,
  }
}

/** The Stays of a Schedule, with their Hotel details. */
export const stayQueries = (sql: SqlClient.SqlClient) => {
  const { upserting, writeStayChanges } = stayCopyQueries(sql)

  const findStay = SqlSchema.findOneOption({
    Request: Schema.Struct({ scheduleId: ScheduleId, stayId: CopyId }),
    Result: Schema.Struct({ id: CopyId }),
    execute: ({ scheduleId, stayId }) =>
      sql`SELECT id FROM stays WHERE scheduleId = ${scheduleId} AND id = ${stayId}`,
  })

  const updateHotelDetails = SqlSchema.void({
    Request: Schema.Struct({
      scheduleId: ScheduleId,
      stayId: CopyId,
      hotelName: Schema.NullOr(Schema.String),
      hotelAddress: Schema.NullOr(Schema.String),
      hotelConfirmationNumber: Schema.NullOr(Schema.String),
    }),
    execute: ({ scheduleId, stayId, ...columns }) =>
      sql`
        UPDATE stays SET ${sql.update(columns)}
        WHERE scheduleId = ${scheduleId} AND id = ${stayId}
      `,
  })

  const deleteFrom = (
    table: string,
    column: string,
    scheduleId: ScheduleId,
    ids: ReadonlyArray<string>,
  ) =>
    ids.length === 0
      ? Effect.void
      : sql`
          DELETE FROM ${sql(table)}
          WHERE scheduleId = ${scheduleId} AND ${sql.in(column, ids)}
        `

  return {
    hasStay: (scheduleId: ScheduleId, stayId: string) =>
      Effect.map(findStay({ scheduleId, stayId }), Option.isSome),

    /**
     * Replaces the Hotel details on a Stay of a Schedule; a field absent
     * removes it.
     */
    writeHotelDetails: (
      scheduleId: ScheduleId,
      stayId: string,
      details: HotelDetails,
    ) => updateHotelDetails({ scheduleId, stayId, ...hotelColumnsOf(details) }),

    /**
     * Saves an applied Stay edit. It deletes the Stays, Moves, Verify claims
     * and Ticks the edit drops, then writes the ones it keeps.
     */
    saveStayEdit: Effect.fnUntraced(function* (
      scheduleId: ScheduleId,
      { dropped, ...kept }: AppliedStayEdit,
    ) {
      yield* deleteFrom('checklistTicks', 'itemId', scheduleId, dropped.ticks)
      yield* deleteFrom('stays', 'id', scheduleId, dropped.stays)
      yield* deleteFrom('moves', 'id', scheduleId, dropped.moves)
      yield* deleteFrom('verifyClaims', 'id', scheduleId, dropped.verifyClaims)
      yield* writeStayChanges(scheduleId, kept, upserting)
    }),
  }
}
