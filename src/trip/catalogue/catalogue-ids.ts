export const placeIds = [
  'tokyo',
  'kyoto',
  'kanazawa',
  'kamakura',
  'enoshima',
  'uji',
] as const

export type PlaceId = (typeof placeIds)[number]

export const stationIds = ['tokyo', 'kyoto', 'tsuruga', 'kanazawa'] as const

export type StationId = (typeof stationIds)[number]

export const railLineIds = [
  'tokaido-shinkansen',
  'hokuriku-shinkansen',
  'thunderbird',
] as const

export type RailLineId = (typeof railLineIds)[number]
