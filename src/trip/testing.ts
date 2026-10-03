// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
// What the Trip service's tests share: the Durable Object's SQL and
// migrations over Node's SQLite in memory, the Trip over given content, and
// the Clock set to a moment. Only the tests import this.
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { DateTime, Layer } from 'effect'
import { TestClock } from 'effect/testing'

import type { ItineraryContent } from '@/trip/domain'
import { OperationId } from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { migrations } from '@/trip/migrations'
import { Trip } from '@/trip/Trip'

/** A fresh database for each test. */
export const storage = Layer.effectDiscard(
  SqliteMigrator.run({ loader: migrations }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })))

/** The Trip over the given Itinerary content, in Option number order. */
export const tripWith = (contents: ReadonlyArray<ItineraryContent>) =>
  Trip.layer.pipe(Layer.provide(Itineraries.fromContent(contents)))

/** The Trip over the real Itinerary catalogue. */
export const liveTrip = Trip.layer.pipe(Layer.provide(Itineraries.layer))

/** Sets the Clock to a moment given as an ISO 8601 UTC string. */
export const setTime = (instant: string) =>
  TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)))

/** The nth client-generated operation id of a test. */
export const operation = (n: number) =>
  OperationId.make(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
