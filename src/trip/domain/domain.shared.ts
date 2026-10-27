import { Schema } from 'effect'

import { Checklist } from '@/trip/domain/domain.checklist'
import { DayPage, ScheduleMap, Schedules } from '@/trip/domain/domain.schedule'

/**
 * The current Schedule whole. It holds the Schedules as /schedule shows them,
 * every Day page in Trip order, the Checklist with its Ticks and the Schedule
 * on its map. The Trip reads it as one transaction, so nothing in it comes
 * from two moments. The browser keeps it, so any Day and the map open
 * offline.
 */
export const ScheduleSnapshot = Schema.Struct({
  schedules: Schedules,
  days: Schema.Array(DayPage),
  checklist: Checklist,
  map: ScheduleMap,
})

export type ScheduleSnapshot = typeof ScheduleSnapshot.Type
