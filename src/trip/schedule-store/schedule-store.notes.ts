// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option, Schema } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient } from 'effect/sql'

import { CopyId, IsoDate, ScheduleId } from '@/trip/domain/domain'
import { storedNote } from '@/trip/schedule-store/schedule-store.shared'

/** The Day notes, Stay notes and Trip note. */
export const noteQueries = (sql: SqlClient.SqlClient) => {
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

  const updateStayNote = SqlSchema.void({
    Request: Schema.Struct({
      scheduleId: ScheduleId,
      stayId: CopyId,
      note: Schema.NullOr(Schema.String),
    }),
    execute: ({ scheduleId, stayId, note }) =>
      sql`
        UPDATE stays SET note = ${note}
        WHERE scheduleId = ${scheduleId} AND id = ${stayId}
      `,
  })

  const findTripNote = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ note: Schema.String }),
    execute: () => sql`SELECT note FROM tripNote WHERE id = 1`,
  })

  const upsertTripNote = SqlSchema.void({
    Request: Schema.String,
    execute: (note) =>
      sql`
        INSERT INTO tripNote (id, note) VALUES (1, ${note})
        ON CONFLICT (id) DO UPDATE SET note = excluded.note
      `,
  })

  const deleteTripNote = SqlSchema.void({
    Request: Schema.Void,
    execute: () => sql`DELETE FROM tripNote`,
  })

  return {
    /** Replaces the Day note on a Day of a Schedule; empty removes it. */
    writeDayNote: (scheduleId: ScheduleId, date: IsoDate, note: string) =>
      updateDayNote({ scheduleId, date, note: storedNote(note) }),

    /** Replaces the Stay note on a Stay of a Schedule; empty removes it. */
    writeStayNote: (scheduleId: ScheduleId, stayId: string, note: string) =>
      updateStayNote({ scheduleId, stayId, note: storedNote(note) }),

    tripNote: Effect.map(
      findTripNote(undefined),
      Option.map(({ note }) => note),
    ),

    /** Replaces the Trip note; empty removes it. */
    writeTripNote: (note: string) =>
      note === '' ? deleteTripNote(undefined) : upsertTripNote(note),
  }
}
