// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option, Schema } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient } from 'effect/sql'

import { ChecklistItemId, IsoDate, ScheduleId } from '@/trip/domain/domain'

const OwnChecklistItemRow = Schema.Struct({
  id: ChecklistItemId,
  text: Schema.String,
  reminderDate: Schema.NullOr(IsoDate),
  ticked: Schema.BooleanFromBit,
})

export type OwnChecklistItem = typeof OwnChecklistItemRow.Type

/** The Checklist's Ticks and Phillip's own Checklist items. */
export const checklistQueries = (sql: SqlClient.SqlClient) => {
  const findTicks = SqlSchema.findAll({
    Request: ScheduleId,
    Result: Schema.Struct({ itemId: ChecklistItemId }),
    execute: (scheduleId) =>
      sql`SELECT itemId FROM checklistTicks WHERE scheduleId = ${scheduleId}`,
  })

  const TickRow = Schema.Struct({
    scheduleId: ScheduleId,
    itemId: ChecklistItemId,
  })

  const insertTick = SqlSchema.void({
    Request: TickRow,
    execute: (row) =>
      sql`INSERT INTO checklistTicks ${sql.insert(row)} ON CONFLICT DO NOTHING`,
  })

  const deleteTick = SqlSchema.void({
    Request: TickRow,
    execute: ({ scheduleId, itemId }) =>
      sql`
        DELETE FROM checklistTicks
        WHERE scheduleId = ${scheduleId} AND itemId = ${itemId}
      `,
  })

  const findOwnItems = SqlSchema.findAll({
    Request: Schema.Void,
    Result: OwnChecklistItemRow,
    execute: () =>
      sql`
        SELECT id, text, reminderDate, ticked FROM ownChecklistItems
        ORDER BY position
      `,
  })

  const insertOwnItem = SqlSchema.void({
    Request: Schema.Struct({
      id: ChecklistItemId,
      text: Schema.String,
      reminderDate: Schema.NullOr(IsoDate),
    }),
    execute: ({ id, text, reminderDate }) =>
      sql`
        INSERT INTO ownChecklistItems (id, position, text, reminderDate, ticked)
        SELECT ${id}, COALESCE(MAX(position), 0) + 1, ${text}, ${reminderDate}, 0
        FROM ownChecklistItems
      `,
  })

  const updateOwnTick = SqlSchema.findOneOption({
    Request: Schema.Struct({
      id: ChecklistItemId,
      ticked: Schema.BooleanFromBit,
    }),
    Result: Schema.Struct({ id: ChecklistItemId }),
    execute: ({ id, ticked }) =>
      sql`
        UPDATE ownChecklistItems SET ticked = ${ticked} WHERE id = ${id}
        RETURNING id
      `,
  })

  const deleteOwnItem = SqlSchema.void({
    Request: ChecklistItemId,
    execute: (id) => sql`DELETE FROM ownChecklistItems WHERE id = ${id}`,
  })

  return {
    ticks: (scheduleId: ScheduleId) =>
      Effect.map(
        findTicks(scheduleId),
        (rows): ReadonlySet<string> =>
          new Set(rows.map(({ itemId }) => itemId)),
      ),

    writeTick: (scheduleId: ScheduleId, itemId: string, ticked: boolean) =>
      (ticked ? insertTick : deleteTick)({ scheduleId, itemId }),

    /** Phillip's own Checklist items, in the order he added them. */
    ownItems: findOwnItems(undefined),

    /** Adds one of Phillip's own Checklist items, unticked, after the rest. */
    addOwnItem: (id: string, text: string, reminderDate: IsoDate | null) =>
      insertOwnItem({ id, text, reminderDate }),

    /** Sets the tick on one of Phillip's own items: false when none has the id. */
    writeOwnTick: (id: string, ticked: boolean) =>
      Effect.map(updateOwnTick({ id, ticked }), Option.isSome),

    removeOwnItem: deleteOwnItem,
  }
}
