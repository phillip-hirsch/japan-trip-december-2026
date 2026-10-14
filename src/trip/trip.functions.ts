import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'

import {
  AddActivity,
  AddActivityOutcome,
  AddOwnChecklistItem,
  AddOwnChecklistItemOutcome,
  ChangeStayBase,
  Checklist,
  ChooseItinerary,
  ChooseOutcome,
  DayOutcome,
  EditActivity,
  EditActivityOutcome,
  HomeState,
  IsoDate,
  MergeStays,
  MoveActivity,
  MoveActivityOutcome,
  MoveStayBoundary,
  OptionNumber,
  RemoveActivity,
  RemoveActivityOutcome,
  RemoveOwnChecklistItem,
  RemoveOwnChecklistItemOutcome,
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
  SetPinOutcome,
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
  .handler(({ data }) =>
    callTripStore(WriteDayNoteOutcome, (store) => store.writeDayNote(data)),
  )

export const writeStayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteStayNote))
  .handler(({ data }) =>
    callTripStore(WriteStayNoteOutcome, (store) => store.writeStayNote(data)),
  )

export const writeHotelDetails = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteHotelDetails))
  .handler(({ data }) =>
    callTripStore(WriteHotelDetailsOutcome, (store) =>
      store.writeHotelDetails(data),
    ),
  )

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
      Trip.use((trip) => trip.resolveLocationLink(data)).pipe(
        Effect.map((coordinates): ResolveLocationLinkOutcome =>
          ResolveLocationLinkOutcome.cases.Resolved.make({ coordinates }),
        ),
        Effect.catchTags({
          LocationLinkRefused: ({ reason }) =>
            Effect.succeed<ResolveLocationLinkOutcome>(
              ResolveLocationLinkOutcome.cases.LocationLinkRefused.make({
                reason,
              }),
            ),
          NoCoordinatesInLink: () =>
            Effect.succeed<ResolveLocationLinkOutcome>(
              ResolveLocationLinkOutcome.cases.NoCoordinatesInLink.make({}),
            ),
          CoordinatesOutsideJapan: ({ coordinates }) =>
            Effect.succeed<ResolveLocationLinkOutcome>(
              ResolveLocationLinkOutcome.cases.CoordinatesOutsideJapan.make({
                coordinates,
              }),
            ),
        }),
      ),
    ),
  )

export const setPin = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SetPin))
  .handler(({ data }) =>
    callTripStore(SetPinOutcome, (store) => store.setPin(data)),
  )

export const writeTripNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteTripNote))
  .handler(({ data }) =>
    callTripStore(WriteTripNoteOutcome, (store) => store.writeTripNote(data)),
  )

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

export const tickOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickOwnChecklistItem))
  .handler(({ data }) =>
    callTripStore(TickOwnChecklistItemOutcome, (store) =>
      store.tickOwnChecklistItem(data),
    ),
  )

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
