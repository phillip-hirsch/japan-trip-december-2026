// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { deepStrictEqual } from '@effect/vitest/utils'
import { DateTime, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { readFileSync } from 'node:fs'

import { DetailTileArchive } from '@/trip/DetailTileArchive'

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

const archiveKey = 'detail.pmtiles'

const archiveInMemory = (stored: Uint8Array) =>
  DetailTileArchive.of({
    getKey: () => archiveKey,
    getBytes: (offset, length) =>
      Promise.resolve({ data: stored.slice(offset, offset + length).buffer }),
  })

/** A real Detail tiles archive of two tiles of open ocean. */
export const openOceanArchive = archiveInMemory(
  Uint8Array.from(readFileSync(new URL('open-ocean.pmtiles', import.meta.url))),
)

export const unreadableArchive = DetailTileArchive.of({
  getKey: () => archiveKey,
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
