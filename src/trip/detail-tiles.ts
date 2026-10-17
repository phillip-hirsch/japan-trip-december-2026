import { Clock, Duration, Effect, Option, Schema } from 'effect'
import { Compression, EtagMismatch, PMTiles, ResolvedValueCache } from 'pmtiles'
import type { DecompressFunc, Source } from 'pmtiles'

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

/** How long a warm isolate trusts its cached directories without a check. */
const recheckEvery = Duration.toMillis(Duration.minutes(1))

/**
 * Drops the cached header and directories if the archive has been replaced
 * since they were read: a one-byte read naming their etag fails if so.
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
 * Builds the Trip service's Detail tile lookup. Its cache holds the archive's
 * header and directories as plain values, never promises, since a Worker
 * can't share a promise between requests, so later tiles from the same
 * isolate skip those reads.
 *
 * A tile the cached directories lack is answered without reading the
 * archive, so at most once a minute the lookup checks that the archive hasn't
 * been replaced, such as to cover a new place.
 */
export const detailTileLookup = Effect.sync(() => {
  const directories = new ResolvedValueCache()
  let checkedAt: number | undefined

  return Effect.fn('Trip.detailTile')(function* (tile: TileCoordinates) {
    if (!isOnTheMap(tile)) return Option.none<DetailTile>()
    const source = yield* DetailTileArchive
    // PMTiles hands each tile it reads to this callback with the compression
    // its own archive's header names. The tile leaves as stored, so the
    // Worker never spends CPU unzipping one, and keeps that compression, even
    // if another request meanwhile finds the archive replaced.
    let compression = Compression.Unknown

    const keepCompressed: DecompressFunc = (bytes, stored) => {
      compression = stored

      return Promise.resolve(bytes)
    }

    const archive = new PMTiles(source, directories, keepCompressed)
    const now = yield* Clock.currentTimeMillis
    const due = checkedAt !== undefined && now - checkedAt >= recheckEvery

    if (checkedAt === undefined || due) checkedAt = now

    const found = yield* Effect.tryPromise({
      try: async (signal) => {
        if (due) await recheck(archive, source, directories, signal)
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
