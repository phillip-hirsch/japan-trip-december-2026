import { Schema } from 'effect'

import { Checklist } from '@/trip/domain/domain.checklist'
import {
  DayPage,
  ScheduleDetail,
  Schedules,
} from '@/trip/domain/domain.schedule'

export * from '@/trip/domain/domain.itinerary'

export * from '@/trip/domain/domain.writes'

export * from '@/trip/domain/domain.schedule'

export * from '@/trip/domain/domain.stays'

export * from '@/trip/domain/domain.notes'

export * from '@/trip/domain/domain.activities'

export * from '@/trip/domain/domain.checklist'

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

/** A tile of the web map: its zoom, then its column and row at that zoom. */
export interface TileCoordinates {
  readonly z: number
  readonly x: number
  readonly y: number
}

/** A Detail tile as its archive stores it: a vector tile, still compressed. */
export interface DetailTile {
  readonly bytes: Uint8Array<ArrayBuffer>
  /** The HTTP content coding the bytes are in. */
  readonly encoding: 'gzip' | 'br' | 'zstd' | 'identity'
}

/** The Detail tiles can't be read, such as while their archive is missing. */
export class DetailTilesUnavailable extends Schema.TaggedError<DetailTilesUnavailable>()(
  'DetailTilesUnavailable',
  {},
) {}
