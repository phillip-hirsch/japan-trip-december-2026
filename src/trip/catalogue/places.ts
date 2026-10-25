import type { DisplayString } from '@/fonts/display-strings'
import type { PlaceId } from '@/trip/catalogue/catalogue-ids'

export type CatalogueCoordinates = {
  readonly latitude: number
  readonly longitude: number
}

/**
 * The one catalogue of places that Bases and Day trip destinations share,
 * keyed by stable id. Coordinates, in decimal degrees, are the town's main
 * station.
 */
export const places = {
  tokyo: {
    romaji: 'Tokyo',
    kanji: '東京',
    coordinates: { latitude: 35.6812, longitude: 139.7671 },
  },
  kyoto: {
    romaji: 'Kyoto',
    kanji: '京都',
    coordinates: { latitude: 34.9858, longitude: 135.7588 },
  },
  kanazawa: {
    romaji: 'Kanazawa',
    kanji: '金沢',
    coordinates: { latitude: 36.578, longitude: 136.6475 },
  },
  kamakura: {
    romaji: 'Kamakura',
    kanji: '鎌倉',
    coordinates: { latitude: 35.3192, longitude: 139.5505 },
  },
  enoshima: {
    romaji: 'Enoshima',
    kanji: '江ノ島',
    coordinates: { latitude: 35.2997, longitude: 139.4804 },
  },
  uji: {
    romaji: 'Uji',
    kanji: '宇治',
    coordinates: { latitude: 34.8893, longitude: 135.8077 },
  },
} as const satisfies Record<
  PlaceId,
  {
    readonly romaji: string
    readonly kanji: DisplayString
    readonly coordinates: CatalogueCoordinates
  }
>

export const isPlaceId = (id: string): id is PlaceId =>
  Object.hasOwn(places, id)

export const visitedPlaceIds: ReadonlySet<PlaceId> = new Set<PlaceId>([
  'tokyo',
  'kyoto',
])
