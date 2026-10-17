import { Effect, Option, Schema } from 'effect'
import { Compression, PMTiles, ResolvedValueCache } from 'pmtiles'
import type { DecompressFunc } from 'pmtiles'

import { DetailTileArchive } from '@/trip/DetailTileArchive'
import { DetailTilesUnavailable } from '@/trip/domain'
import type { DetailTile, TileCoordinates } from '@/trip/domain'

class ArchiveUnreadable extends Schema.TaggedError<ArchiveUnreadable>()(
  'ArchiveUnreadable',
  { cause: Schema.Defect() },
) {}

/** PMTiles numbers tiles exactly only up to this zoom. */
const maxZoom = 26

const isOnTheMap = ({ z, x, y }: TileCoordinates) =>
  Number.isInteger(z) &&
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  z >= 0 &&
  z <= maxZoom &&
  x >= 0 &&
  y >= 0 &&
  x < 2 ** z &&
  y < 2 ** z

const encodings: Record<Compression, DetailTile['encoding']> = {
  [Compression.Unknown]: 'identity',
  [Compression.None]: 'identity',
  [Compression.Gzip]: 'gzip',
  [Compression.Brotli]: 'br',
  [Compression.Zstd]: 'zstd',
}

/** Tiles leave as stored, so the Worker never spends CPU unzipping one. */
const keepCompressed: DecompressFunc = (bytes) => Promise.resolve(bytes)

/**
 * Builds the Trip service's Detail tile lookup. Its cache holds the archive's
 * header and directories as plain values, never promises, since a Worker
 * can't share a promise between requests, so later tiles from the same
 * isolate skip those reads.
 */
export const detailTileLookup = Effect.sync(() => {
  const directories = new ResolvedValueCache()

  return Effect.fn('Trip.detailTile')(function* (tile: TileCoordinates) {
    if (!isOnTheMap(tile)) return Option.none<DetailTile>()

    const archive = new PMTiles(
      yield* DetailTileArchive,
      directories,
      keepCompressed,
    )

    const found = yield* Effect.tryPromise({
      try: async (signal) => {
        const { tileCompression } = await archive.getHeader()
        const stored = await archive.getZxy(tile.z, tile.x, tile.y, signal)

        return stored === undefined
          ? undefined
          : {
              bytes: new Uint8Array(stored.data),
              encoding: encodings[tileCompression],
            }
      },
      catch: (cause) => new ArchiveUnreadable({ cause }),
    }).pipe(
      Effect.tapError(({ cause }) =>
        Effect.logError('Detail tiles unavailable', cause),
      ),
      Effect.mapError(() => new DetailTilesUnavailable()),
    )

    return Option.fromNullishOr(found)
  })
})
