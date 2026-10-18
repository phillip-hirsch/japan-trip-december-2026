import { assert, describe, it } from '@effect/vitest'
import { Effect, Fiber, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { gunzipSync } from 'node:zlib'
import { Compression } from 'pmtiles'

import { DetailTileArchive } from '@/trip/DetailTileArchive'
import { DetailTilesUnavailable } from '@/trip/domain'
import type { TileCoordinates } from '@/trip/domain'
import {
  assertFailedWith,
  liveTrip,
  openOcean,
  openOceanArchive,
  openOceanEast,
  replaceableArchive,
  unreadableArchive,
} from '@/trip/testing'
import { Trip } from '@/trip/Trip'

// open-ocean.pmtiles is a real Protomaps extract (build 20261017) of one box of
// open Pacific Ocean, zoom 9 and 10 only, so it holds one tile at each zoom:
// go-pmtiles extract https://build.protomaps.com/20261017.pmtiles \
//   open-ocean.pmtiles --bbox=150.05,30.05,150.1,30.1 --minzoom=9 --maxzoom=10
const inTheBox = [
  { z: 9, x: 469, y: 211 },
  { z: 10, x: 938, y: 422 },
]

const detailTile = (
  tile: TileCoordinates,
  archive: DetailTileArchive['Service'] = openOceanArchive,
) =>
  Trip.use((trip) => trip.detailTile(tile)).pipe(
    Effect.provideService(DetailTileArchive, archive),
  )

describe('Trip.detailTile', () => {
  it.effect('serves each Detail tile in the archive as stored, gzipped', () =>
    Effect.gen(function* () {
      for (const tile of inTheBox) {
        const served = Option.getOrThrow(yield* detailTile(tile))

        assert.strictEqual(served.encoding, 'gzip')
        assert.isAbove(gunzipSync(served.bytes).byteLength, 0)
      }
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect('serves the same Detail tile again from a warm archive', () =>
    Effect.gen(function* () {
      const tile = { z: 10, x: 938, y: 422 }
      const first = Option.getOrThrow(yield* detailTile(tile))
      const again = Option.getOrThrow(yield* detailTile(tile))

      assert.deepStrictEqual(again.bytes, first.bytes)
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect("has no Detail tile outside the archive's boxes", () =>
    Effect.gen(function* () {
      for (const tile of [
        { z: 10, x: 939, y: 422 },
        { z: 9, x: 469, y: 212 },
      ]) {
        assert.isTrue(Option.isNone(yield* detailTile(tile)))
      }
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect("has no Detail tile beyond the archive's zoom levels", () =>
    Effect.gen(function* () {
      for (const tile of [
        { z: 8, x: 234, y: 105 },
        { z: 11, x: 1876, y: 844 },
      ]) {
        assert.isTrue(Option.isNone(yield* detailTile(tile)))
      }
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect('has no Detail tile at coordinates off the tile grid', () =>
    Effect.gen(function* () {
      for (const tile of [
        { z: 10, x: 1024, y: 422 },
        { z: 10, x: 938, y: 1024 },
        { z: 10, x: -1, y: 422 },
        { z: 10, x: 938.5, y: 422 },
        { z: 31, x: 0, y: 0 },
      ]) {
        assert.isTrue(Option.isNone(yield* detailTile(tile)))
      }
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect("serves a replaced archive's Detail tiles within a minute", () =>
    Effect.gen(function* () {
      const { archive, replace } = replaceableArchive(openOcean)
      const west = { z: 10, x: 938, y: 422 }
      const east = { z: 10, x: 939, y: 422 }

      assert.isTrue(Option.isNone(yield* detailTile(east, archive)))

      replace(openOceanEast)
      yield* TestClock.adjust('1 minute')

      assert.isTrue(Option.isSome(yield* detailTile(east, archive)))
      assert.isTrue(Option.isNone(yield* detailTile(west, archive)))
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect('names the encoding of the archive a Detail tile came from', () =>
    Effect.gen(function* () {
      const { archive, replace } = replaceableArchive(openOcean)
      const tile = { z: 9, x: 469, y: 211 }

      // Byte 98 of a PMTiles v3 header names the tiles' compression.
      const markedUncompressed = openOceanEast.slice()
      markedUncompressed[98] = Compression.None

      yield* detailTile(tile, archive)
      replace(markedUncompressed)
      const served = Option.getOrThrow(yield* detailTile(tile, archive))

      assert.strictEqual(served.encoding, 'identity')
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect(
    'names the encoding of the tile read, even as another request sees a replaced archive',
    () =>
      Effect.gen(function* () {
        const { archive, replace, holdNextRead } = replaceableArchive(openOcean)

        const tile = { z: 9, x: 469, y: 211 }

        const markedUncompressed = openOceanEast.slice()
        markedUncompressed[98] = Compression.None

        yield* detailTile(tile, archive)
        const reached = holdNextRead()
        const slow = yield* Effect.forkChild(detailTile(tile, archive))
        const release = yield* Effect.promise(() => reached)

        replace(markedUncompressed)
        yield* detailTile(tile, archive)
        release()
        const served = Option.getOrThrow(yield* Fiber.join(slow))

        assert.strictEqual(served.encoding, 'gzip')
      }).pipe(Effect.provide(liveTrip)),
  )

  it.effect('fails as unavailable when the archive cannot be read', () =>
    Effect.gen(function* () {
      assertFailedWith(
        yield* Effect.flip(
          detailTile({ z: 10, x: 938, y: 422 }, unreadableArchive),
        ),
        new DetailTilesUnavailable(),
      )
    }).pipe(Effect.provide(liveTrip)),
  )
})
