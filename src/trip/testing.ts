// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { deepStrictEqual } from '@effect/vitest/utils'
import { DateTime, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { readFileSync } from 'node:fs'
import { EtagMismatch } from 'pmtiles'

import { DetailTileArchive } from '@/trip/DetailTileArchive'
import { detailTilesKey } from '@/trip/detail-tile-source'

import type { ItineraryContent } from '@/trip/domain'
import { OperationId } from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { LocationLinkResolver } from '@/trip/LocationLinkResolver'
import { migrations } from '@/trip/migrations'
import { recordedResponses } from '@/trip/recorded-location-links'
import { Trip } from '@/trip/Trip'

export const storage = Layer.effectDiscard(
  SqliteMigrator.run({ loader: migrations }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })))

export const recordedLinks = LocationLinkResolver.of({
  request: (url) => {
    const response = recordedResponses[url.href]

    return response === undefined
      ? Effect.die(new Error(`No response recorded for ${url.href}`))
      : Effect.succeed(response)
  },
})

export const tripWith = (
  contents: ReadonlyArray<ItineraryContent>,
  links: LocationLinkResolver['Service'] = recordedLinks,
) =>
  Trip.layer.pipe(
    Layer.provide([
      Itineraries.fromContent(contents),
      Layer.succeed(LocationLinkResolver, links),
    ]),
  )

export const liveTrip = Trip.layer.pipe(
  Layer.provide([
    Itineraries.layer,
    Layer.succeed(LocationLinkResolver, recordedLinks),
  ]),
)

const fixture = (name: string) =>
  Uint8Array.from(readFileSync(new URL(name, import.meta.url)))

/** A real Detail tiles archive of two tiles of open ocean. */
export const openOcean = fixture('open-ocean.pmtiles')

/** The same, one tile further east at zoom 10. */
export const openOceanEast = fixture('open-ocean-east.pmtiles')

/**
 * An archive in memory that an upload can replace, as in the bucket. Each
 * upload has its own etag, and a read naming an older one fails as R2's does.
 * `holdNextRead` lets a test pause one read after it has taken its bytes,
 * as a slow response would, until `release`.
 */
export const replaceableArchive = (first: Uint8Array) => {
  let stored = first
  let upload = 1
  let hold: ((release: () => void) => void) | undefined

  const read = (offset: number, length: number, etag: string | undefined) =>
    etag !== undefined && etag !== `upload-${upload}`
      ? Promise.reject(new EtagMismatch())
      : Promise.resolve({
          data: stored.slice(offset, offset + length).buffer,
          etag: `upload-${upload}`,
        })

  const archive = DetailTileArchive.of({
    getKey: () => detailTilesKey,
    getBytes: (offset, length, _signal, etag) => {
      const result = read(offset, length, etag)
      const holding = hold
      hold = undefined

      if (holding === undefined) return result
      // Handled now, so a stale read held back isn't reported as unhandled;
      // the caller still gets its rejection once released.
      result.catch(() => undefined)

      return new Promise<void>((release) => holding(release)).then(() => result)
    },
  })

  const replace = (next: Uint8Array) => {
    stored = next
    upload += 1
  }

  /** Resolves, with its release, once the next read has taken its bytes. */
  const holdNextRead = () =>
    new Promise<() => void>((reached) => {
      hold = reached
    })

  return { archive, replace, holdNextRead }
}

export const openOceanArchive = replaceableArchive(openOcean).archive

export const unreadableArchive = DetailTileArchive.of({
  getKey: () => detailTilesKey,
  getBytes: () => Promise.reject(new Error('The bucket is unreachable')),
})

/** Sets the Clock to a moment given as an ISO 8601 UTC string. */
export const setTime = (instant: string) =>
  TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)))

export const operation = (n: number) =>
  OperationId.make(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)

/**
 * Asserts a failure is the one expected, down to what it carries.
 * `assert.deepStrictEqual` compares errors by name and message alone, so it
 * can't tell one Hard rule from another.
 */
export const assertFailedWith = <E extends Error>(actual: E, expected: E) =>
  deepStrictEqual(actual, expected)
