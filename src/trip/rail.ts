// Plain data, no Effect. The rail schemas in domain.ts read their ids from
// here, like the place catalogue.

/** The stations where Moves' rail sections start and end, keyed by stable id. */
export const stations = {
  tokyo: { name: 'Tokyo' },
  kyoto: { name: 'Kyoto' },
  tsuruga: { name: 'Tsuruga' },
  kanazawa: { name: 'Kanazawa' },
} as const satisfies Record<string, { readonly name: string }>

export type StationId = keyof typeof stations

export const stationIds = Object.keys(stations) as ReadonlyArray<StationId>

/** The shinkansen and limited-express lines that Moves' rail sections ride. */
export const railLineIds = [
  'tokaido-shinkansen',
  'hokuriku-shinkansen',
  'thunderbird',
] as const
