import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'

import {
  AddActivity,
  AddActivityOutcome,
  AddOwnChecklistItem,
  AddOwnChecklistItemOutcome,
  Checklist,
  ChooseItinerary,
  ChooseOutcome,
  DayOutcome,
  EditActivity,
  EditActivityOutcome,
  HomeState,
  IsoDate,
  MoveActivity,
  MoveActivityOutcome,
  OptionNumber,
  RemoveActivity,
  RemoveActivityOutcome,
  RemoveOwnChecklistItem,
  RemoveOwnChecklistItemOutcome,
  RestoreOutcome,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleId,
  Schedules,
  ScheduleSummary,
  TickChecklistItem,
  TickChecklistItemOutcome,
  TickOwnChecklistItem,
  TickOwnChecklistItemOutcome,
  WriteDayNote,
  WriteDayNoteOutcome,
  WriteHotelDetails,
  WriteHotelDetailsOutcome,
  WriteStayNote,
  WriteStayNoteOutcome,
  WriteTripNote,
  WriteTripNoteOutcome,
} from '@/trip/domain'
import { runTrip } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'
import { callTripStore } from '@/trip/trip-store.server'

// Server functions are thin adapters around the Trip service: validate the
// input with Schema (inline, so the client build strips it with the
// validator), map the service's typed failures, and run it through runTrip.
// Its storage operations run in the Trip store, reached only through
// callTripStore.

/**
 * Home's state at the moment of the request, in Tokyo. Personal state, so it
 * comes from the Trip store and is never prerendered.
 */
export const getHome = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(HomeState, (store) => store.home()),
)

/**
 * One Day of Phillip's Schedule as its page shows it, null before he chooses
 * one, or not-found for a date outside the Trip. The browser checks the date
 * first; this is the server's own check.
 */
export const getDay = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ date: IsoDate })))
  .handler(async ({ data }) => {
    const outcome = await callTripStore(DayOutcome, (store) =>
      store.day(data.date),
    )

    return DayOutcome.match(outcome, {
      Day: (outcome) => outcome.page,
      NoSchedule: () => null,
      DayNotFound: () => {
        throw notFound()
      },
    })
  })

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

/**
 * Writes the Day note on a Day of the Schedule named, as a whole value. The
 * write is idempotent, so it carries no operation id; the Trip service
 * enforces the length cap and refuses a Schedule that isn't current.
 */
export const writeDayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteDayNote))
  .handler(({ data }) =>
    callTripStore(WriteDayNoteOutcome, (store) => store.writeDayNote(data)),
  )

/**
 * Writes the Stay note on a Stay of the Schedule named, as a whole value.
 * The write is idempotent, so it carries no operation id; the Trip service
 * enforces the length cap and refuses a Schedule that isn't current.
 */
export const writeStayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteStayNote))
  .handler(({ data }) =>
    callTripStore(WriteStayNoteOutcome, (store) => store.writeStayNote(data)),
  )

/**
 * Writes the Hotel details on a Stay of the Schedule named, as a whole value.
 * The write is idempotent, so it carries no operation id; the Trip service
 * trims the fields, enforces the length cap and refuses a Schedule that isn't
 * current.
 */
export const writeHotelDetails = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteHotelDetails))
  .handler(({ data }) =>
    callTripStore(WriteHotelDetailsOutcome, (store) =>
      store.writeHotelDetails(data),
    ),
  )

/**
 * Writes the Trip note as a whole value. It belongs to no Schedule, so it
 * names none; the Trip service enforces the length cap.
 */
export const writeTripNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteTripNote))
  .handler(({ data }) =>
    callTripStore(WriteTripNoteOutcome, (store) => store.writeTripNote(data)),
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
 * The current Schedule (null before Phillip chooses one), the archived ones
 * and the Trip note, from one moment.
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

/**
 * The Checklist, derived from the current Schedule as it is now, with
 * Phillip's own items; only his own before he chooses one.
 */
export const getChecklist = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(Checklist, (store) => store.checklist()),
)

/**
 * Sets the tick on an item derived from the Schedule named, to true or
 * false. Setting is idempotent, so it carries no operation id; the Trip
 * service refuses a Schedule that isn't current.
 */
export const tickChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickChecklistItem))
  .handler(({ data }) =>
    callTripStore(TickChecklistItemOutcome, (store) =>
      store.tickChecklistItem(data),
    ),
  )

/**
 * Adds one of Phillip's own Checklist items. Repeating the operation id
 * returns the first result, so a retry never adds it twice.
 */
export const addOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AddOwnChecklistItem))
  .handler(({ data }) =>
    callTripStore(AddOwnChecklistItemOutcome, (store) =>
      store.addOwnChecklistItem(data),
    ),
  )

/**
 * Sets the tick on one of Phillip's own Checklist items, to true or false.
 * It belongs to no Schedule, so it names none.
 */
export const tickOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickOwnChecklistItem))
  .handler(({ data }) =>
    callTripStore(TickOwnChecklistItemOutcome, (store) =>
      store.tickOwnChecklistItem(data),
    ),
  )

/**
 * Removes one of Phillip's own Checklist items; removing one already gone
 * succeeds, so a retry is safe.
 */
export const removeOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RemoveOwnChecklistItem))
  .handler(({ data }) =>
    callTripStore(RemoveOwnChecklistItemOutcome, (store) =>
      store.removeOwnChecklistItem(data),
    ),
  )

/**
 * Adds an Activity on a Day of the Schedule named. Repeating the operation id
 * returns the first result, so a retry never adds it twice.
 */
export const addActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AddActivity))
  .handler(({ data }) =>
    callTripStore(AddActivityOutcome, (store) => store.addActivity(data)),
  )

/**
 * Writes the fields an edit carries on an Activity of the Schedule named.
 * Each field is a whole value, so the write is idempotent and carries no
 * operation id.
 */
export const editActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(EditActivity))
  .handler(({ data }) =>
    callTripStore(EditActivityOutcome, (store) => store.editActivity(data)),
  )

/**
 * Removes an Activity of the Schedule named. A retry after it landed finds
 * nothing to remove and answers not-found.
 */
export const removeActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RemoveActivity))
  .handler(({ data }) =>
    callTripStore(RemoveActivityOutcome, (store) => store.removeActivity(data)),
  )

/**
 * Moves an Activity of the Schedule named before another on its Day, or
 * last. Moving to the same place again changes nothing, so it carries no
 * operation id.
 */
export const moveActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MoveActivity))
  .handler(({ data }) =>
    callTripStore(MoveActivityOutcome, (store) => store.moveActivity(data)),
  )
