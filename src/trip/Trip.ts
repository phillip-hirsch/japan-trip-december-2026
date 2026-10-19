import { Context, Effect, Layer } from 'effect'

import { detailTileLookup } from '@/trip/detail-tiles'
import { Itineraries } from '@/trip/Itineraries'
import { LocationLinkResolver } from '@/trip/LocationLinkResolver'
import { activityMethods } from '@/trip/Trip.activities'
import { checklistMethods } from '@/trip/Trip.checklist'
import { itineraryMethods } from '@/trip/Trip.itinerary'
import { noteMethods } from '@/trip/Trip.notes'
import { scheduleMethods } from '@/trip/Trip.schedule'
import { buildCatalogueLookups, CatalogueLookups } from '@/trip/Trip.shared'
import { stayMethods } from '@/trip/Trip.stays'
import type { TripContract } from '@/trip/Trip.contract'

export * from '@/trip/Trip.contract'

export * from '@/trip/Trip.shared'

export * from '@/trip/Trip.guards'

export * from '@/trip/Trip.itinerary'

export * from '@/trip/Trip.schedule'

export * from '@/trip/Trip.stays'

export * from '@/trip/Trip.notes'

export * from '@/trip/Trip.checklist'

export * from '@/trip/Trip.activities'

/**
 * The application seam: all Trip behaviour, independent of HTTP and React.
 *
 * Its storage operations take the SQL client from their caller rather than
 * from its layer: only the Durable Object has one (and the tests, over Node's
 * SQLite), so the Worker can't run them by mistake.
 */
export class Trip extends Context.Service<Trip, TripContract>()(
  'japan-trip/trip/Trip',
) {
  static readonly layer = Layer.effect(
    Trip,
    Effect.gen(function* () {
      const detailTile = yield* detailTileLookup

      return Trip.of({
        ...(yield* itineraryMethods),
        detailTile,
        ...(yield* scheduleMethods),
        ...(yield* noteMethods),
        ...(yield* stayMethods),
        ...(yield* checklistMethods),
        ...(yield* activityMethods),
      })
    }).pipe(
      Effect.provideServiceEffect(CatalogueLookups, buildCatalogueLookups),
    ),
  )

  /** The Trip over the real Itinerary catalogue, following links online. */
  static readonly live = Trip.layer.pipe(
    Layer.provide([Itineraries.layer, LocationLinkResolver.layer]),
  )
}
