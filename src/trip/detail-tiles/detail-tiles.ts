import { Clock, Duration, Effect, Option, Schema } from 'effect'
import { Compression, EtagMismatch, PMTiles, ResolvedValueCache } from 'pmtiles'
import type { DecompressFunc, Source } from 'pmtiles'

import { DetailTileArchive } from '@/trip/detail-tiles/DetailTileArchive'
import { DetailTilesUnavailable } from '@/trip/domain/domain'
import type { DetailTile, TileCoordinates } from '@/trip/domain/domain'

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

/** How long a warm isolate trusts its cached directories without a check. */
const recheckEvery = Duration.toMillis(Duration.minutes(1))

/**
 * Drops the cached header and directories if an upload has replaced the
 * archive since PMTiles read them. A one-byte read naming their etag fails in
 * that case.
 */
const recheck = async (
  archive: PMTiles,
  source: Source,
  directories: ResolvedValueCache,
  signal: AbortSignal,
) => {
  const { etag } = await archive.getHeader()

  try {
    await source.getBytes(0, 1, signal, etag)
  } catch (cause) {
    if (!(cause instanceof EtagMismatch)) throw cause
    await directories.invalidate(source)
  }
}

/**
 * Builds the Trip service's Detail tile lookup. Its cache keeps the
 * archive's header and directories, so later tiles from the same isolate skip
 * those reads. It keeps them as plain values, never promises, because a
 * Worker can't share a promise between requests.
 *
 * The lookup answers a tile the cached directories lack without reading the
 * archive. So at most once a minute it checks that no upload has replaced the
 * archive, such as one that covers a new place.
 */
export const detailTileLookup = Effect.sync(() => {
  const directories = new ResolvedValueCache()
  let checkedAt: number | undefined

  return Effect.fn('Trip.detailTile')(function* (tile: TileCoordinates) {
    if (!isOnTheMap(tile)) return Option.none<DetailTile>()
    const source = yield* DetailTileArchive
    // PMTiles passes each tile it reads to this callback, with the compression
    // the header of that archive names. The callback returns the bytes
    // unchanged, so the Worker never spends CPU unzipping a tile. It records
    // the compression, so the tile keeps it even if another request finds the
    // archive replaced in the meantime.
    let compression = Compression.Unknown

    const keepCompressed: DecompressFunc = (bytes, stored) => {
      compression = stored

      return Promise.resolve(bytes)
    }

    const archive = new PMTiles(source, directories, keepCompressed)
    const now = yield* Clock.currentTimeMillis
    // The first request reads the header fresh, so it counts as a check.
    checkedAt ??= now
    // Each request that finds a check due makes its own, until one succeeds,
    // so none answers from directories a replaced archive made stale.
    const due = now - checkedAt >= recheckEvery

    const found = yield* Effect.tryPromise({
      try: async (signal) => {
        if (due) {
          await recheck(archive, source, directories, signal)
          checkedAt = Math.max(checkedAt ?? now, now)
        }

        const stored = await archive.getZxy(tile.z, tile.x, tile.y, signal)

        return stored === undefined
          ? undefined
          : {
              bytes: new Uint8Array(stored.data),
              encoding: encodings[compression],
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
