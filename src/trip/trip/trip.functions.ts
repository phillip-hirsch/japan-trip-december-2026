import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'

import {
  AddActivity,
  AddOwnChecklistItem,
  ChangeStayBase,
  Checklist,
  ChooseItinerary,
  ChooseOutcome,
  DayOutcome,
  EditActivity,
  HomeState,
  IsoDate,
  MergeStays,
  MoveActivity,
  MoveStayBoundary,
  OptionNumber,
  outcomeOf,
  RemoveActivity,
  RemoveOwnChecklistItem,
  ResolveLocationLink,
  ResolveLocationLinkOutcome,
  RestoreOutcome,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleId,
  ScheduleMap,
  Schedules,
  ScheduleSummary,
  SplitStay,
  StayEditOutcome,
  SetPin,
  TickChecklistItem,
  TickOwnChecklistItem,
  WriteDayNote,
  WriteHotelDetails,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain/domain'
import { runTrip } from '@/trip/trip/runtime.server'
import { Trip } from '@/trip/trip/Trip'
import {
  callTripStore,
  tripWriteHandler,
} from '@/trip/trip-store/trip-store.server'

// Server functions are thin adapters around the Trip service: validate the
// input with Schema (inline, so the client build strips it with the
// validator), map the service's typed failures, and run it through runTrip.
// Its storage operations run in the Trip store, reached only through
// callTripStore. A Trip write in the registry (trip-writes.ts) needs only its
// input schema and tripWriteHandler with its operation's name, and the
// registry derives its outcome. An operation run outside the Trip store gets
// its outcome the same way, through outcomeOf.

/**
 * Home's state at the moment of the request, in Tokyo. Personal state, so it
 * comes from the Trip store and is never prerendered.
 */
export const getHome = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(HomeState, (store) => store.home()),
)

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

export const getItineraries = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.itineraries)),
)

export const getComparisonMap = createServerFn({ method: 'GET' }).handler(() =>
  runTrip(Trip.use((trip) => trip.comparisonMap)),
)

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

export const writeDayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteDayNote))
  .handler(tripWriteHandler('writeDayNote'))

export const writeStayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteStayNote))
  .handler(tripWriteHandler('writeStayNote'))

export const writeHotelDetails = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteHotelDetails))
  .handler(tripWriteHandler('writeHotelDetails'))

export const splitStay = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SplitStay))
  .handler(({ data }) =>
    callTripStore(StayEditOutcome, (store) => store.splitStay(data)),
  )

export const mergeStays = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MergeStays))
  .handler(({ data }) =>
    callTripStore(StayEditOutcome, (store) => store.mergeStays(data)),
  )

export const moveStayBoundary = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MoveStayBoundary))
  .handler(({ data }) =>
    callTripStore(StayEditOutcome, (store) => store.moveStayBoundary(data)),
  )

export const changeStayBase = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(ChangeStayBase))
  .handler(({ data }) =>
    callTripStore(StayEditOutcome, (store) => store.changeStayBase(data)),
  )

export const resolveLocationLink = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(ResolveLocationLink))
  .handler(({ data }) =>
    runTrip(
      outcomeOf(
        ResolveLocationLinkOutcome,
        Trip.use((trip) => trip.resolveLocationLink(data)).pipe(
          Effect.map((coordinates) => ({ coordinates })),
        ),
      ),
    ),
  )

export const setPin = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SetPin))
  .handler(tripWriteHandler('setPin'))

export const writeTripNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteTripNote))
  .handler(tripWriteHandler('writeTripNote'))

export const getScheduleById = createServerFn({ method: 'GET' })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ scheduleId: ScheduleId })),
  )
  .handler(({ data }) =>
    callTripStore(Schema.NullOr(ScheduleDetail), (store) =>
      store.schedule(data.scheduleId),
    ),
  )

export const getSchedules = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(Schedules, (store) => store.schedules()),
)

export const getScheduleMap = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(Schema.NullOr(ScheduleMap), (store) => store.scheduleMap()),
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

export const getChecklist = createServerFn({ method: 'GET' }).handler(() =>
  callTripStore(Checklist, (store) => store.checklist()),
)

export const tickChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickChecklistItem))
  .handler(tripWriteHandler('tickChecklistItem'))

/**
 * Adds one of Phillip's own Checklist items. Repeating the operation id
 * returns the first result, so a retry never adds it twice.
 */
export const addOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AddOwnChecklistItem))
  .handler(tripWriteHandler('addOwnChecklistItem'))

export const tickOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickOwnChecklistItem))
  .handler(tripWriteHandler('tickOwnChecklistItem'))

export const removeOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RemoveOwnChecklistItem))
  .handler(tripWriteHandler('removeOwnChecklistItem'))

/**
 * Adds an Activity on a Day of the Schedule named. Repeating the operation id
 * returns the first result, so a retry never adds it twice.
 */
export const addActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AddActivity))
  .handler(tripWriteHandler('addActivity'))

export const editActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(EditActivity))
  .handler(tripWriteHandler('editActivity'))

/**
 * Removes an Activity of the Schedule named. A retry after it landed finds
 * nothing to remove and answers not-found.
 */
export const removeActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RemoveActivity))
  .handler(tripWriteHandler('removeActivity'))

/**
 * Moves an Activity of the Schedule named before another on its Day, or
 * last. Moving to the same place again changes nothing, so it carries no
 * operation id.
 */
export const moveActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MoveActivity))
  .handler(tripWriteHandler('moveActivity'))
