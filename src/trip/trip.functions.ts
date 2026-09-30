import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'

import { OptionNumber } from '@/trip/domain'
import { runTrip } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'

// Server functions are thin adapters around the Trip service: validate the
// input with Schema (inline, so the client build strips it with the
// validator), map the service's typed failures, and run it through runTrip.

/** Home's state at the moment of the request. */
export const getHome = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.home)),
)

/** Every Itinerary by Option number and name. */
export const getItineraries = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.itineraries)),
)

/** One Itinerary with its Stays and 15 Days, or not-found. */
export const getItinerary = createServerFn({ method: 'GET' })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ optionNumber: OptionNumber })),
  )
  .handler(async ({ data }) => {
    const itinerary = await runTrip(
      Trip.use((trip) => trip.itinerary(data.optionNumber)).pipe(
        Effect.catchTag('ItineraryNotFound', () => Effect.succeed(null)),
      ),
    )
    if (itinerary === null) throw notFound()
    return itinerary
  })
