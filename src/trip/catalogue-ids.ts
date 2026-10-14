export const placeIds = [
  'tokyo',
  'kyoto',
  'osaka',
  'hiroshima',
  'kanazawa',
  'hakone',
  'fukuoka',
  'kamakura',
  'nikko',
  'enoshima',
  'uji',
  'dazaifu',
] as const

export type PlaceId = (typeof placeIds)[number]

export const stationIds = [
  'tokyo',
  'kyoto',
  'tsuruga',
  'kanazawa',
  'odawara',
  'hakata',
] as const

export type StationId = (typeof stationIds)[number]

export const railLineIds = [
  'tokaido-shinkansen',
  'tokaido-sanyo-shinkansen',
  'hokuriku-shinkansen',
  'thunderbird',
] as const

export type RailLineId = (typeof railLineIds)[number]
