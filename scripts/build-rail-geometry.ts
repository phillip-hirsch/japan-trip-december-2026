// Rebuilds the rail geometry: each rail section the Itineraries ride, along
// its real line, clipped between its stations and simplified. The source is
// MLIT's National Land Numerical Information railway data (N02), FY2025
// edition, CC BY 4.0. Needs network access and `unzip`.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { Effect, Layer, Schema } from 'effect'
import { runnerImport } from 'vite-plus'
import type { InlineConfig } from 'vite-plus'

import type {
  Coordinates,
  RailSectionDetail,
  Station,
} from '../src/trip/domain.ts'
import type { Itineraries } from '../src/trip/Itineraries.ts'
// Relative, not '@/': plain `node` runs this script and can't resolve the alias.
import { railSectionIdsOf, railSectionKey } from '../src/trip/rail.ts'
import type { RailLineId } from '../src/trip/rail.ts'
import type { Trip } from '../src/trip/Trip.ts'

const source = 'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip'
const sourceEntry = 'N02-25_GML/UTF-8/N02-25_RailroadSection.geojson'
const output = 'src/trip/rail-geometry.json'

/** The ceiling on the gzipped GeoJSON, which ships in every Itinerary page. */
const budgetBytes = 15 * 1024
/** How far the simplified line may stray from the real one. */
const toleranceKm = 0.03
/** How far a station may be from its line before the build gives up. */
const stationReachKm = 1

/**
 * The MLIT lines each rail line's trains ride, by line name and, where
 * several railways share a name, operator.
 */
const mlitLines: Record<
  RailLineId,
  ReadonlyArray<{ readonly name: string; readonly operator?: string }>
> = {
  'tokaido-shinkansen': [{ name: '東海道新幹線' }],
  'tokaido-sanyo-shinkansen': [
    { name: '東海道新幹線' },
    { name: '山陽新幹線' },
  ],
  // From Tokyo it runs on the Tohoku Shinkansen to Omiya and the Joetsu
  // Shinkansen to Takasaki.
  'hokuriku-shinkansen': [
    { name: '東北新幹線' },
    { name: '上越新幹線' },
    { name: '北陸新幹線' },
  ],
  // Kyoto to Yamashina on the Tokaido line, then the Kosei and Hokuriku lines.
  thunderbird: [
    { name: '東海道線', operator: '西日本旅客鉄道' },
    { name: '湖西線' },
    { name: '北陸線', operator: '西日本旅客鉄道' },
  ],
}

const MlitRailroadSections = Schema.Struct({
  features: Schema.Array(
    Schema.Struct({
      properties: Schema.Struct({
        /** Line name. */
        N02_003: Schema.String,
        /** Operator. */
        N02_004: Schema.String,
      }),
      geometry: Schema.Struct({
        type: Schema.Literal('LineString'),
        coordinates: Schema.Array(Schema.Tuple([Schema.Finite, Schema.Finite])),
      }),
    }),
  ),
})

type Position = readonly [longitude: number, latitude: number]

const positionOf = ({ longitude, latitude }: Coordinates): Position => [
  longitude,
  latitude,
]

/** Kilometres east and north of an origin: close enough at this scale. */
const planarFrom = (origin: Position) => {
  const kmPerDegree = 111.32
  const kmPerLongitude = kmPerDegree * Math.cos((origin[1] * Math.PI) / 180)
  return ([longitude, latitude]: Position) => ({
    x: (longitude - origin[0]) * kmPerLongitude,
    y: (latitude - origin[1]) * kmPerDegree,
  })
}

const kmBetween = (a: Position, b: Position) => {
  const { x, y } = planarFrom(a)(b)
  return Math.hypot(x, y)
}

/** The line's track as a graph of its vertices, joined where pieces meet. */
const graphOf = (
  features: (typeof MlitRailroadSections.Type)['features'],
  line: RailLineId,
) => {
  const pieces = features.filter(({ properties }) =>
    mlitLines[line].some(
      ({ name, operator }) =>
        properties.N02_003 === name &&
        (operator === undefined || properties.N02_004 === operator),
    ),
  )
  if (pieces.length === 0) throw new Error(`No MLIT track for ${line}.`)
  const keyOf = ([longitude, latitude]: Position) =>
    `${longitude.toFixed(5)},${latitude.toFixed(5)}`
  const positions = new Map<string, Position>()
  const edges = new Map<string, Array<{ to: string; km: number }>>()
  const connect = (a: Position, b: Position) => {
    const [from, to] = [keyOf(a), keyOf(b)]
    if (from === to) return
    const km = kmBetween(a, b)
    for (const [start, end, position] of [
      [from, to, a],
      [to, from, b],
    ] as const) {
      positions.set(start, position)
      edges.set(start, [...(edges.get(start) ?? []), { to: end, km }])
    }
  }
  for (const { geometry } of pieces) {
    geometry.coordinates.slice(1).forEach((end, index) => {
      connect(geometry.coordinates[index] ?? end, end)
    })
  }
  return { positions, edges }
}

type TrackGraph = ReturnType<typeof graphOf>

/** The shortest way along the track between the vertices nearest two stations. */
const trackBetween = (
  { positions, edges }: TrackGraph,
  section: RailSectionDetail,
): Array<Position> => {
  const nearest = (station: Station) => {
    const target = positionOf(station.coordinates)
    let best: { key: string; km: number } | undefined
    for (const [key, position] of positions) {
      const km = kmBetween(target, position)
      if (best === undefined || km < best.km) best = { key, km }
    }
    if (best === undefined || best.km > stationReachKm) {
      throw new Error(`${station.name} is not on ${section.line}.`)
    }
    return best.key
  }
  const [start, end] = [nearest(section.from), nearest(section.to)]
  const distance = new Map([[start, 0]])
  const previous = new Map<string, string>()
  const unvisited = new Set([start])
  while (unvisited.size > 0) {
    let current = start
    let currentKm = Infinity
    for (const key of unvisited) {
      const km = distance.get(key) ?? Infinity
      if (km < currentKm) [current, currentKm] = [key, km]
    }
    if (current === end) break
    unvisited.delete(current)
    for (const { to, km } of edges.get(current) ?? []) {
      if (currentKm + km < (distance.get(to) ?? Infinity)) {
        distance.set(to, currentKm + km)
        previous.set(to, current)
        unvisited.add(to)
      }
    }
  }
  if (!distance.has(end)) {
    throw new Error(
      `No track on ${section.line} from ${section.from.name} to ${section.to.name}.`,
    )
  }
  const keys = [end]
  for (
    let key = previous.get(end);
    key !== undefined;
    key = previous.get(key)
  ) {
    keys.unshift(key)
  }
  return keys.flatMap((key) => {
    const position = positions.get(key)
    return position ? [position] : []
  })
}

/** Ramer–Douglas–Peucker: drops vertices within the tolerance of the line. */
const simplified = (path: ReadonlyArray<Position>): Array<Position> => {
  const first = path[0]
  if (first === undefined || path.length < 3) return [...path]
  const toKm = planarFrom(first)
  const points = path.map(toKm)
  const keep = new Set([0, path.length - 1])
  const ranges: Array<readonly [number, number]> = [[0, path.length - 1]]
  for (let range = ranges.pop(); range !== undefined; range = ranges.pop()) {
    const [from, to] = range
    const a = points[from]
    const b = points[to]
    if (a === undefined || b === undefined) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    let farthest = { index: from, km: 0 }
    for (let index = from + 1; index < to; index++) {
      const p = points[index]
      if (p === undefined) continue
      const km =
        length === 0
          ? Math.hypot(p.x - a.x, p.y - a.y)
          : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) /
            length
      if (km > farthest.km) farthest = { index, km }
    }
    if (farthest.km > toleranceKm) {
      keep.add(farthest.index)
      ranges.push([from, farthest.index], [farthest.index, to])
    }
  }
  return path.filter((_, index) => keep.has(index))
}

/** About 1 m: finer than the simplification. */
const rounded = ([longitude, latitude]: Position): Position => [
  Math.round(longitude * 1e5) / 1e5,
  Math.round(latitude * 1e5) / 1e5,
]

// The catalogue's rail sections, read through the Trip service. Vite's module
// runner resolves the '@/' imports that plain `node` can't.
const viteConfig: InlineConfig = {
  configFile: false,
  resolve: { tsconfigPaths: true },
}
const [tripModule, itinerariesModule] = await Promise.all([
  runnerImport<{ Trip: typeof Trip }>('/src/trip/Trip.ts', viteConfig),
  runnerImport<{ Itineraries: typeof Itineraries }>(
    '/src/trip/Itineraries.ts',
    viteConfig,
  ),
])
const { Trip: TripService } = tripModule.module
const sections = await Effect.runPromise(
  TripService.use((trip) => trip.railSections).pipe(
    Effect.provide(
      TripService.layer.pipe(
        Layer.provide(itinerariesModule.module.Itineraries.layer),
      ),
    ),
  ),
)

const work = mkdtempSync(join(tmpdir(), 'rail-geometry-'))
const archive = join(work, 'N02-25_GML.zip')
const response = await fetch(source)
if (!response.ok) throw new Error(`MLIT download failed: ${response.status}`)
writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
const { features } = Schema.decodeSync(
  Schema.fromJsonString(MlitRailroadSections),
)(
  execFileSync('unzip', ['-p', archive, sourceEntry], {
    maxBuffer: 256 * 1024 * 1024,
  }).toString('utf8'),
)

const graphs = new Map<RailLineId, TrackGraph>()
const geometry = {
  type: 'FeatureCollection',
  features: sections.map((section) => {
    const graph = graphs.get(section.line) ?? graphOf(features, section.line)
    graphs.set(section.line, graph)
    const ids = railSectionIdsOf(section)
    const track = simplified(trackBetween(graph, section)).map(rounded)
    // End exactly at the stations, so consecutive sections join up.
    const path = [
      positionOf(section.from.coordinates),
      ...track.slice(1, -1),
      positionOf(section.to.coordinates),
    ]
    console.log(
      `${section.line} ${section.from.name} → ${section.to.name}: ${path.length} points`,
    )
    return {
      type: 'Feature',
      id: railSectionKey(ids),
      properties: ids,
      geometry: { type: 'LineString', coordinates: path },
    }
  }),
}

const json = JSON.stringify(geometry)
const gzippedBytes = gzipSync(json, { level: 9 }).length
console.log(`${json.length} bytes, ${gzippedBytes} gzipped`)
if (gzippedBytes > budgetBytes) {
  throw new Error(
    `The rail geometry is ${gzippedBytes} bytes gzipped, over its ${budgetBytes}-byte budget.`,
  )
}
writeFileSync(output, `${json}\n`)
