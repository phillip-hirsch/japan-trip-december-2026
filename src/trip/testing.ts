// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
// What the Trip service's tests share: the Durable Object's SQL and
// migrations over Node's SQLite in memory, the Trip over given content, and
// the Clock set to a moment. Only the tests import this.
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { DateTime, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'

import type { ItineraryContent } from '@/trip/domain'
import { OperationId } from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { LocationLinkResolver } from '@/trip/LocationLinkResolver'
import { migrations } from '@/trip/migrations'
import { recordedResponses } from '@/trip/recorded-location-links'
import { Trip } from '@/trip/Trip'

/** A fresh database for each test. */
export const storage = Layer.effectDiscard(
  SqliteMigrator.run({ loader: migrations }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })))

/**
 * A location-link resolver replaying the recorded responses of real short
 * links. A link with none recorded is a mistake in the test, so it dies.
 */
export const recordedLinks = LocationLinkResolver.of({
  request: (url) => {
    const response = recordedResponses[url.href]

    return response === undefined
      ? Effect.die(new Error(`No response recorded for ${url.href}`))
      : Effect.succeed(response)
  },
})

/**
 * The Trip over the given Itinerary content, in Option number order, and
 * the recorded location links unless given another resolver.
 */
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

/** The Trip over the real Itinerary catalogue and recorded location links. */
export const liveTrip = Trip.layer.pipe(
  Layer.provide([
    Itineraries.layer,
    Layer.succeed(LocationLinkResolver, recordedLinks),
  ]),
)

/** Sets the Clock to a moment given as an ISO 8601 UTC string. */
export const setTime = (instant: string) =>
  TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)))

/** The nth client-generated operation id of a test. */
export const operation = (n: number) =>
  OperationId.make(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
