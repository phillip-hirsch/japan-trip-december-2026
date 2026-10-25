import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'

import {
  AddActivity,
  AddOwnChecklistItem,
  ChangeStayBase,
  DayOutcome,
  EditActivity,
  IsoDate,
  MergeStays,
  MoveActivity,
  MoveStayBoundary,
  outcomeOf,
  RemoveActivity,
  RemoveOwnChecklistItem,
  ResolveLocationLink,
  ResolveLocationLinkOutcome,
  SplitStay,
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
  callTripOperation,
  tripOperationHandler,
} from '@/trip/trip-store/trip-store.server'

// Server functions are thin adapters around the Trip service: validate the
// input with Schema (inline, so the client build strips it with the
// validator) and run the operation. No server function maps a typed failure
// by hand. Storage operations run in the Trip store, each named in its
// registry (trip-operations.ts). The registry derives an operation's outcome
// from its success value and failure classes. A read that can't fail names
// its result schema instead. A server function for a registered operation is
// its input schema plus tripOperationHandler with the operation's name. An
// operation run outside the Trip store derives its outcome with outcomeOf. A
// page read turns its not-found case into the router's notFound, or null.

/**
 * Home's state at the moment of the request, in Tokyo. Personal state, so it
 * comes from the Trip store and is never prerendered.
 */
export const getHome = createServerFn({ method: 'GET' }).handler(
  tripOperationHandler('home'),
)

/** A Day's page. */
export const getDay = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ date: IsoDate })))
  .handler(async ({ data }) => {
    const outcome = await callTripOperation('day', data)

    return DayOutcome.match(outcome, {
      Day: ({ page }) => page,
      DayNotFound: () => {
        throw notFound()
      },
    })
  })

export const writeDayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteDayNote))
  .handler(tripOperationHandler('writeDayNote'))

export const writeStayNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteStayNote))
  .handler(tripOperationHandler('writeStayNote'))

export const writeHotelDetails = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteHotelDetails))
  .handler(tripOperationHandler('writeHotelDetails'))

export const splitStay = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(SplitStay))
  .handler(tripOperationHandler('splitStay'))

export const mergeStays = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MergeStays))
  .handler(tripOperationHandler('mergeStays'))

export const moveStayBoundary = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MoveStayBoundary))
  .handler(tripOperationHandler('moveStayBoundary'))

export const changeStayBase = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(ChangeStayBase))
  .handler(tripOperationHandler('changeStayBase'))

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
  .handler(tripOperationHandler('setPin'))

export const writeTripNote = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(WriteTripNote))
  .handler(tripOperationHandler('writeTripNote'))

export const getSchedules = createServerFn({ method: 'GET' }).handler(
  tripOperationHandler('schedules'),
)

/**
 * The current Schedule whole. The browser fills the Schedule and every Day
 * page from it, so they read offline.
 */
export const getScheduleSnapshot = createServerFn({ method: 'GET' }).handler(
  tripOperationHandler('scheduleSnapshot'),
)

export const getScheduleMap = createServerFn({ method: 'GET' }).handler(
  tripOperationHandler('scheduleMap'),
)

export const getChecklist = createServerFn({ method: 'GET' }).handler(
  tripOperationHandler('checklist'),
)

export const tickChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickChecklistItem))
  .handler(tripOperationHandler('tickChecklistItem'))

/**
 * Adds one of Phillip's own Checklist items. Repeating the operation id
 * returns the first result, so a retry never adds it twice.
 */
export const addOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AddOwnChecklistItem))
  .handler(tripOperationHandler('addOwnChecklistItem'))

export const tickOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(TickOwnChecklistItem))
  .handler(tripOperationHandler('tickOwnChecklistItem'))

export const removeOwnChecklistItem = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RemoveOwnChecklistItem))
  .handler(tripOperationHandler('removeOwnChecklistItem'))

/**
 * Adds an Activity on a Day of the Schedule named. Repeating the operation id
 * returns the first result, so a retry never adds it twice.
 */
export const addActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(AddActivity))
  .handler(tripOperationHandler('addActivity'))

export const editActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(EditActivity))
  .handler(tripOperationHandler('editActivity'))

/**
 * Removes an Activity of the Schedule named. A retry after it landed finds
 * nothing to remove and answers not-found.
 */
export const removeActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(RemoveActivity))
  .handler(tripOperationHandler('removeActivity'))

/**
 * Moves an Activity of the Schedule named before another on its Day, or
 * last. Moving to the same place again changes nothing, so it carries no
 * operation id.
 */
export const moveActivity = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(MoveActivity))
  .handler(tripOperationHandler('moveActivity'))
