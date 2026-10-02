import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'

import {
  ChooseItinerary,
  ChooseOutcome,
  OptionNumber,
  RestoreOutcome,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleId,
  Schedules,
  ScheduleSummary,
} from '@/trip/domain'
import { runTrip } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'
import { callTripStore } from '@/trip/trip-store.server'

// Server functions are thin adapters around the Trip service: validate the
// input with Schema (inline, so the client build strips it with the
// validator), map the service's typed failures, and run it through runTrip.
// Its storage operations run in the Trip store, reached only through
// callTripStore.

/** Home's state at the moment of the request. */
export const getHome = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.home)),
)

/** Every Itinerary with its comparison rows. */
export const getItineraries = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.itineraries)),
)

/** Every Itinerary's Moves and Bases for the map overlaying them all. */
export const getComparisonMap = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.comparisonMap)),
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

/**
 * Copies an Itinerary into Phillip's Schedule, archiving the current one.
 * Repeating the operation id returns the first result, so a retry never
 * chooses twice.
 */
export const chooseItinerary = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(ChooseItinerary))
  .handler(({ data }) =>
    callTripStore(ChooseOutcome, (store) => store.choose(data)),
  )

/**
 * Makes an archived Schedule current again, archiving the current one.
 * Repeating the operation id returns the first result, so a retry never
 * restores twice.
 */
export const restoreSchedule = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RestoreSchedule))
  .handler(({ data }) =>
    callTripStore(RestoreOutcome, (store) => store.restore(data)),
  )

/** One Schedule, current or archived, or null when none has that id. */
export const getScheduleById = createServerFn({ method: 'GET' })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ scheduleId: ScheduleId })),
  )
  .handler(({ data }) =>
    callTripStore(Schema.NullOr(ScheduleDetail), (store) =>
      store.schedule(data.scheduleId),
    ),
  )

/**
 * The current Schedule (null before Phillip chooses one) and the archived
 * ones, from one moment.
 */
export const getSchedules = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(Schedules, (store) => store.schedules()),
)

/**
 * The current Schedule's summary, or null before Phillip chooses one. Only
 * the browser asks for it, after hydration, so prerendered pages never
 * contain it.
 */
export const getScheduleSummary = createServerFn({ method: 'GET' }).handler(
  () =>
    callTripStore(Schema.NullOr(ScheduleSummary), (store) =>
      store.scheduleSummary(),
    ),
)
