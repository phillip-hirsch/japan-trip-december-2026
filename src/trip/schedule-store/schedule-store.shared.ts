// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Schema } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient, Statement } from 'effect/sql'

import { ScheduleId } from '@/trip/domain/domain'
import type { Pin } from '@/trip/domain/domain'

export const ofSchedule = { scheduleId: ScheduleId }

export const ordered = { position: Schema.Int }

export const storedNote = (note: string) => (note === '' ? null : note)

export const PinColumns = Schema.Struct({
  pinLatitude: Schema.NullOr(Schema.Finite),
  pinLongitude: Schema.NullOr(Schema.Finite),
  pinLink: Schema.NullOr(Schema.String),
})

export type PinColumns = typeof PinColumns.Type

export const pinColumnsOf = (pin: Pin | undefined): PinColumns => ({
  pinLatitude: pin?.coordinates.latitude ?? null,
  pinLongitude: pin?.coordinates.longitude ?? null,
  pinLink: pin?.link ?? null,
})

export const pinOf = ({
  pinLatitude,
  pinLongitude,
  pinLink,
}: PinColumns): Pin | undefined =>
  pinLatitude === null || pinLongitude === null
    ? undefined
    : {
        coordinates: { latitude: pinLatitude, longitude: pinLongitude },
        ...(pinLink !== null && { link: pinLink }),
      }

/** Query builders that several areas use. */
export const queryBuilders = (sql: SqlClient.SqlClient) => {
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

  const rowsOf = <S extends Schema.Top>(
    Result: S,
    execute: (scheduleId: string) => Statement.Statement<unknown>,
  ) => SqlSchema.findAll({ Request: ScheduleId, Result, execute })

  return { insertInto, inserter, rowsOf }
}
