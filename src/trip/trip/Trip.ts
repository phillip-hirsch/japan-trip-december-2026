import { Context, Effect, Layer } from 'effect'

import { detailTileLookup } from '@/trip/detail-tiles/detail-tiles'
import { Itinerary } from '@/trip/itinerary/Itinerary'
import { LocationLinkResolver } from '@/trip/location-links/LocationLinkResolver'
import { activityMethods } from '@/trip/trip/Trip.activities'
import { checklistMethods } from '@/trip/trip/Trip.checklist'
import { itineraryMethods } from '@/trip/trip/Trip.itinerary'
import { noteMethods } from '@/trip/trip/Trip.notes'
import { scheduleMethods } from '@/trip/trip/Trip.schedule'
import { stayMethods } from '@/trip/trip/Trip.stays'
import type { TripContract } from '@/trip/trip/Trip.contract'

export * from '@/trip/trip/Trip.contract'

export * from '@/trip/trip/Trip.shared'

export * from '@/trip/trip/Trip.guards'

export * from '@/trip/trip/Trip.itinerary'

export * from '@/trip/trip/Trip.schedule'

export * from '@/trip/trip/Trip.stays'

export * from '@/trip/trip/Trip.notes'

export * from '@/trip/trip/Trip.checklist'

export * from '@/trip/trip/Trip.activities'

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
    }),
  )

  /** The Trip over the Itinerary, Option 1, following links online. */
  static readonly live = Trip.layer.pipe(
    Layer.provide([Itinerary.layer, LocationLinkResolver.layer]),
  )
}
