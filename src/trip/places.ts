// Plain data, no Effect. The Place schema in domain.ts reads its ids from
// here, so this shape can't be derived from that schema without a cycle.
import type { DisplayString } from '@/fonts/display-strings'

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
  osaka: {
    romaji: 'Osaka',
    kanji: '大阪',
    coordinates: { latitude: 34.7025, longitude: 135.4959 },
  },
  hiroshima: {
    romaji: 'Hiroshima',
    kanji: '広島',
    coordinates: { latitude: 34.3973, longitude: 132.4753 },
  },
  kanazawa: {
    romaji: 'Kanazawa',
    kanji: '金沢',
    coordinates: { latitude: 36.578, longitude: 136.6475 },
  },
  hakone: {
    romaji: 'Hakone',
    kanji: '箱根',
    coordinates: { latitude: 35.2324, longitude: 139.1069 },
  },
  fukuoka: {
    romaji: 'Fukuoka',
    kanji: '福岡',
    coordinates: { latitude: 33.5897, longitude: 130.4207 },
  },
  kamakura: {
    romaji: 'Kamakura',
    kanji: '鎌倉',
    coordinates: { latitude: 35.3192, longitude: 139.5505 },
  },
  nikko: {
    romaji: 'Nikko',
    kanji: '日光',
    coordinates: { latitude: 36.7485, longitude: 139.6197 },
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
  string,
  {
    readonly romaji: string
    readonly kanji: DisplayString
    readonly coordinates: {
      readonly latitude: number
      readonly longitude: number
    }
  }
>

export type PlaceId = keyof typeof places

export const placeIds = Object.keys(places) as ReadonlyArray<PlaceId>

/** Places Phillip saw on a previous trip. Every other place is a New place. */
export const visitedPlaceIds: ReadonlySet<PlaceId> = new Set<PlaceId>([
  'tokyo',
  'kyoto',
  'osaka',
  'hiroshima',
])
