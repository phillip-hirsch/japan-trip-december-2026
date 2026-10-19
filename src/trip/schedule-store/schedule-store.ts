// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { activityQueries } from '@/trip/schedule-store/schedule-store.activities'
import { checklistQueries } from '@/trip/schedule-store/schedule-store.checklist'
import { noteQueries } from '@/trip/schedule-store/schedule-store.notes'
import { scheduleQueries } from '@/trip/schedule-store/schedule-store.schedule'
import { stayQueries } from '@/trip/schedule-store/schedule-store.stays'

export * from '@/trip/schedule-store/schedule-store.shared'

export * from '@/trip/schedule-store/schedule-store.schedule'

export * from '@/trip/schedule-store/schedule-store.stays'

export * from '@/trip/schedule-store/schedule-store.notes'

export * from '@/trip/schedule-store/schedule-store.activities'

export * from '@/trip/schedule-store/schedule-store.checklist'

export type ScheduleStore = Effect.Success<typeof scheduleStore>

export const scheduleStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  return {
    ...scheduleQueries(sql),
    ...noteQueries(sql),
    ...activityQueries(sql),
    ...stayQueries(sql),
    ...checklistQueries(sql),
  }
})
