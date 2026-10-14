import type { RailLineId, StationId } from '@/trip/catalogue-ids'
import type { CatalogueCoordinates } from '@/trip/places'

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
  StationId,
  {
    readonly name: string
    readonly coordinates: CatalogueCoordinates
  }
>

export type RailSectionIds = {
  readonly line: RailLineId
  readonly from: StationId
  readonly to: StationId
}

export const railSectionIdsOf = (section: {
  readonly line: RailLineId
  readonly from: { readonly id: StationId }
  readonly to: { readonly id: StationId }
}): RailSectionIds => ({
  line: section.line,
  from: section.from.id,
  to: section.to.id,
})

export const undirectedRailSectionKey = ({ line, from, to }: RailSectionIds) =>
  [line, ...[from, to].sort()].join('/')
