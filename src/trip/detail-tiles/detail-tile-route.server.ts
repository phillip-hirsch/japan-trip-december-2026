import { Effect, Option } from 'effect'

import { detailTileArchive } from '@/trip/detail-tiles/detail-tile-archive.server'
import { detailTilesPath } from '@/trip/detail-tiles/detail-tile-source'
import type { DetailTile, TileCoordinates } from '@/trip/domain/domain'
import { runTrip } from '@/trip/trip/runtime.server'
import { Trip } from '@/trip/trip/Trip'

const detailTilePath = new RegExp(
  `^${detailTilesPath}/(\\d{1,2})/(\\d{1,8})/(\\d{1,8})\\.mvt$`,
)

/** The Detail tile a GET or HEAD request asks for, if it asks for one. */
export const detailTileOf = (request: Request): TileCoordinates | undefined => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
  const match = detailTilePath.exec(new URL(request.url).pathname)

  if (match === null) return undefined
  const [, z, x, y] = match

  return { z: Number(z), x: Number(x), y: Number(y) }
}

// Tiles are Phillip's alone behind Access, so only his browser may keep them.
const cacheable = 'private, max-age=86400'

// An empty tile turns into street detail once an upload adds a place, so the
// browser keeps that answer only briefly.
const brieflyCacheable = 'private, max-age=300'

// A stream, not the bytes, so the response carries no Content-Length. Local
// dev's proxy unzips the body but would keep the zipped length, cutting the
// tile short.
const streamOf = (bytes: Uint8Array<ArrayBuffer>) =>
  new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

const tileResponse = ({ bytes, encoding }: DetailTile) =>
  new Response(streamOf(bytes), {
    headers: {
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      'Cache-Control': cacheable,
      ...(encoding !== 'identity' && { 'Content-Encoding': encoding }),
    },
    // The bytes are already compressed, so the runtime sends them as they are.
    encodeBody: 'manual',
  })

// MapLibre draws a 204 as an empty tile, without an error.
const noTile = () =>
  new Response(null, {
    status: 204,
    headers: { 'Cache-Control': brieflyCacheable },
  })

const unavailable = () =>
  new Response('Detail tiles unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  })

/**
 * Serves one Detail tile as an ordinary response. Only a request that has
 * passed the Access gate reaches it. Its typed failure becomes an HTTP status,
 * not an outcome, so this route maps it instead of `outcomeOf`.
 */
export const serveDetailTile = (tile: TileCoordinates) =>
  runTrip(
    Trip.use((trip) => trip.detailTile(tile)).pipe(
      Effect.map(Option.match({ onNone: noTile, onSome: tileResponse })),
      Effect.catchTag('DetailTilesUnavailable', () =>
        Effect.succeed(unavailable()),
      ),
      Effect.provide(detailTileArchive),
    ),
  ).catch(unavailable)
