// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Schema } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient, Statement } from 'effect/sql'

import { ScheduleId } from '@/trip/domain'

export const ofSchedule = { scheduleId: ScheduleId }

export const ordered = { position: Schema.Int }

export const storedNote = (note: string) => (note === '' ? null : note)

/** The query builders several areas' tables share. */
export const sharedQueries = (sql: SqlClient.SqlClient) => {
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
