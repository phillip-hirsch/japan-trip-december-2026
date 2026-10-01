// Plain data, no Effect. The rail schemas in domain.ts read their ids from
// here, like the place catalogue.
import type { CatalogueCoordinates } from '@/trip/places'

/**
 * The stations where Moves' rail sections start and end, keyed by stable id,
 * with their coordinates in decimal degrees.
 */
export const stations = {
  tokyo: {
    name: 'Tokyo',
    coordinates: { latitude: 35.6812, longitude: 139.7671 },
  },
  kyoto: {
    name: 'Kyoto',
    coordinates: { latitude: 34.9858, longitude: 135.7588 },
  },
  tsuruga: {
    name: 'Tsuruga',
    coordinates: { latitude: 35.6453, longitude: 136.0761 },
  },
  kanazawa: {
    name: 'Kanazawa',
    coordinates: { latitude: 36.578, longitude: 136.6475 },
  },
  odawara: {
    name: 'Odawara',
    coordinates: { latitude: 35.2564, longitude: 139.1556 },
  },
  hakata: {
    name: 'Hakata',
    coordinates: { latitude: 33.5897, longitude: 130.4207 },
  },
} as const satisfies Record<
  string,
  {
    readonly name: string
    readonly coordinates: CatalogueCoordinates
  }
>

export type StationId = keyof typeof stations

export const stationIds = Object.keys(stations) as ReadonlyArray<StationId>

/**
 * The shinkansen and limited-express lines that Moves' rail sections ride. A
 * train that runs through from one line onto another without a change, such
 * as a Nozomi from Kyoto to Hakata, rides a combined line.
 */
export const railLineIds = [
  'tokaido-shinkansen',
  'tokaido-sanyo-shinkansen',
  'hokuriku-shinkansen',
  'thunderbird',
] as const
