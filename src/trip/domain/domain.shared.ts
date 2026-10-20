import { Schema } from 'effect'

import { Checklist } from '@/trip/domain/domain.checklist'
import {
  DayPage,
  ScheduleDetail,
  Schedules,
} from '@/trip/domain/domain.schedule'

/**
 * The current Schedule whole. It holds the Schedules as /schedule shows them,
 * every Day page in Trip order and the Checklist with its Ticks. The Trip
 * reads it as one transaction, so nothing in it comes from two moments. The
 * browser keeps it, so any Day opens offline.
 */
export const ScheduleSnapshot = Schema.Struct({
  schedules: Schema.Struct({ ...Schedules.fields, current: ScheduleDetail }),
  days: Schema.Array(DayPage),
  checklist: Checklist,
})

export type ScheduleSnapshot = typeof ScheduleSnapshot.Type
