// Rebuilds the map's tile extracts from a Protomaps daily build (ODbL):
// - tiles/overview.pmtiles: all of Japan, zoom 0–8.
// - tiles/detail.pmtiles: the Detail tiles, zoom 0–14, in a box around every
//   catalogue place. Run again after adding a place.
// - tiles/detail-local.pmtiles: a small box around Tokyo Station for local
//   development, which `vp run seed-local-tiles` puts in the local bucket.
// Prints each extract's size. Needs Go, which runs go-pmtiles. Pass a build
// date such as `20261017` to pin the build; the default is the latest on the
// tile schema the app's style draws.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Relative, not '@/': plain `node` runs this script and can't resolve the alias.
import { detailTilesMaxZoom } from '../src/trip/detail-tile-source.ts'
import { places } from '../src/trip/places.ts'
import type { CatalogueCoordinates } from '../src/trip/places.ts'

const goPmtiles = 'github.com/protomaps/go-pmtiles@v1.31.2'

const builds = 'https://build-metadata.protomaps.dev/builds.json'

const outputs = 'tiles'

const japan = '129.0,30.9,146.0,45.6'

const overviewMaxZoom = 8

/** How far each place's box reaches from its station to each edge. */
const detailReachKm = 12

const localReachKm = 2

const kmPerDegreeLatitude = 111.32

type Bbox = readonly [west: number, south: number, east: number, north: number]

const boxAround = (
  { latitude, longitude }: CatalogueCoordinates,
  reachKm: number,
): Bbox => {
  const latitudeReach = reachKm / kmPerDegreeLatitude

  const longitudeReach =
    reachKm / (kmPerDegreeLatitude * Math.cos((latitude * Math.PI) / 180))

  return [
    longitude - longitudeReach,
    latitude - latitudeReach,
    longitude + longitudeReach,
    latitude + latitudeReach,
  ]
}

const bboxFlag = (box: Bbox) =>
  `--bbox=${box.map((degrees) => degrees.toFixed(4)).join(',')}`

const ring = ([west, south, east, north]: Bbox) => [
  [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ],
]

// The tile schema @protomaps/basemaps 5 draws. The script skips builds on a
// newer schema, which the app's pinned style might draw wrongly.
const schemaMajor = '4.'

const latestBuild = async () => {
  const response = await fetch(builds)

  if (!response.ok) throw new Error(`Build list failed: ${response.status}`)

  const list: ReadonlyArray<{
    readonly key: string
    readonly version: string
  }> = await response.json()

  const latest = [...list]
    .reverse()
    .find(({ version }) => version.startsWith(schemaMajor))

  if (latest === undefined) {
    throw new Error(`No build on tile schema ${schemaMajor}x`)
  }

  return latest.key.replace('.pmtiles', '')
}

const build = process.argv[2] ?? (await latestBuild())

const source = `https://build.protomaps.com/${build}.pmtiles`

const extract = (output: string, flags: ReadonlyArray<string>) =>
  execFileSync(
    'go',
    ['run', goPmtiles, 'extract', source, output, '--quiet', ...flags],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  )

const plannedSize = (flags: ReadonlyArray<string>) => {
  const log = execFileSync(
    'go',
    [
      'run',
      goPmtiles,
      'extract',
      source,
      'unused.pmtiles',
      '--dry-run',
      ...flags,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  )

  return /archive size of (.+)$/m.exec(log)?.[1] ?? 'unknown'
}

const megabytes = (path: string) =>
  `${(statSync(path).size / 1_000_000).toFixed(1)} MB`

mkdirSync(outputs, { recursive: true })

console.log(`Protomaps build ${build}`)

const detailBoxes = Object.entries(places).map(
  ([id, place]) => [id, boxAround(place.coordinates, detailReachKm)] as const,
)

for (const [id, box] of detailBoxes) {
  const size = plannedSize([bboxFlag(box), `--maxzoom=${detailTilesMaxZoom}`])
  console.log(`  ${id}: ${size} on its own`)
}

const region = join(mkdtempSync(join(tmpdir(), 'map-tiles-')), 'region.json')

writeFileSync(
  region,
  JSON.stringify({
    type: 'MultiPolygon',
    coordinates: detailBoxes.map(([, box]) => ring(box)),
  }),
)

const archives = [
  ['overview', [`--bbox=${japan}`, `--maxzoom=${overviewMaxZoom}`]],
  ['detail', [`--region=${region}`, `--maxzoom=${detailTilesMaxZoom}`]],
  [
    'detail-local',
    [
      bboxFlag(boxAround(places.tokyo.coordinates, localReachKm)),
      `--maxzoom=${detailTilesMaxZoom}`,
    ],
  ],
] as const

for (const [name, flags] of archives) {
  const output = join(outputs, `${name}.pmtiles`)
  extract(output, flags)
  console.log(`${output}: ${megabytes(output)}`)
}
