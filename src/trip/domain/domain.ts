import { Schema } from 'effect'

export * from '@/trip/domain/domain.itinerary'

export * from '@/trip/domain/domain.writes'

export * from '@/trip/domain/domain.schedule'

export * from '@/trip/domain/domain.stays'

export * from '@/trip/domain/domain.notes'

export * from '@/trip/domain/domain.activities'

export * from '@/trip/domain/domain.checklist'

export * from '@/trip/domain/domain.shared'

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
