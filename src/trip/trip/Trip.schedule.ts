import { DateTime, Effect, Option, Struct } from 'effect'

import {
  isTripDate,
  tripEndDate,
  tripStartDate,
  tripTimeZone,
} from '@/trip/domain/calendar'
import {
  DayNotFound,
  HomeState,
  Hotel,
  IsoDate,
  IsoInstant,
  ScheduleChosen,
  ScheduleId,
  ScheduleNotFound,
  ScheduleRestored,
} from '@/trip/domain/domain'
import type {
  ChooseItinerary,
  DayPage,
  Itinerary,
  ItinerarySummary,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleMap,
} from '@/trip/domain/domain'
import { Itineraries } from '@/trip/itineraries/Itineraries'
import { stayForNight } from '@/trip/domain/schedule-copy'
import type { ScheduleCopy } from '@/trip/domain/schedule-copy'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import { archiveReplaced, requireCurrent } from '@/trip/trip/Trip.guards'
import { mapOf, summaryOf } from '@/trip/trip/Trip.itinerary'
import {
  anchorsOf,
  CatalogueLookups,
  daysBetween,
  find,
  staySummaryOf,
} from '@/trip/trip/Trip.shared'

const isoInstantOf = (now: DateTime.DateTime) =>
  IsoInstant.make(DateTime.formatIso(now))

const tokyoDateOf = (now: DateTime.DateTime) =>
  IsoDate.make(
    DateTime.formatIsoDate(
      DateTime.removeTime(DateTime.setZoneNamedUnsafe(now, tripTimeZone)),
    ),
  )

const scheduleMapOf = (copy: ScheduleCopy): ScheduleMap => ({
  ...mapOf(copy),
  hotels: copy.stays.flatMap((stay) =>
    Hotel.match(stay.hotel, {
      NotRecorded: () => [],
      Recorded: ({ _tag, pin, ...details }) =>
        pin
          ? [{ stayId: stay.id, ...staySummaryOf(stay), ...details, pin }]
          : [],
    }),
  ),
  activities: copy.days.flatMap(({ date, activities }) =>
    activities.flatMap(({ id, title, time, pin }) =>
      pin
        ? [{ id, title, ...(time !== undefined && { time }), date, pin }]
        : [],
    ),
  ),
})

const copyOf = (itinerary: Itinerary): ScheduleCopy => {
  const withFreshId = <A extends object>(entity: A) => ({
    ...entity,
    id: crypto.randomUUID(),
  })

  return {
    stays: itinerary.stays.map((stay) => ({
      ...withFreshId(stay),
      hotel: Hotel.cases.NotRecorded.make({}),
    })),
    days: itinerary.days.map((day) => ({ ...day, activities: [] })),
    moves: itinerary.moves.map(withFreshId),
    dayTrips: itinerary.dayTrips.map(withFreshId),
    verifyClaims: itinerary.verifyClaims.map(withFreshId),
    anchors: anchorsOf(itinerary).map(withFreshId),
  }
}

const isDepartureDay = (date: IsoDate) => date === tripEndDate

const firstMoveOnOrAfter = (days: ScheduleDetail['days'], date: IsoDate) =>
  days
    .filter((later) => later.date >= date)
    .flatMap((later) =>
      later.move ? [{ date: later.date, ...later.move }] : [],
    )
    .at(0)

const dayPageOf = (schedule: ScheduleDetail, date: IsoDate) =>
  Option.map(
    Option.fromUndefinedOr(schedule.days.find((day) => day.date === date)),
    (day): DayPage => {
      const tonight = isDepartureDay(date)
        ? undefined
        : stayForNight(schedule.stays, date)

      const nextMove = firstMoveOnOrAfter(schedule.days, date)

      return {
        scheduleId: schedule.id,
        day,
        ...(tonight && {
          tonight: {
            id: tonight.id,
            ...Struct.pick(tonight, [
              'base',
              'checkIn',
              'checkOut',
              'nights',
              'hotel',
            ]),
          },
        }),
        ...(nextMove && { nextMove }),
      }
    },
  )

const homeStateOf = (
  now: DateTime.DateTime,
  schedule: Option.Option<ScheduleDetail>,
  itineraries: ReadonlyArray<ItinerarySummary>,
): HomeState => {
  const date = tokyoDateOf(now)
  const shared = { readAt: DateTime.formatIso(now), itineraries }

  if (date < tripStartDate) {
    return HomeState.cases.BeforeTrip.make({
      ...shared,
      daysToGo: daysBetween(date, tripStartDate),
      schedule: Option.getOrNull(schedule),
    })
  }

  if (date > tripEndDate) {
    return HomeState.cases.AfterTrip.make({
      ...shared,
      schedule: Option.getOrNull(schedule),
    })
  }

  return HomeState.cases.DuringTrip.make({
    ...shared,
    date,
    today: Option.getOrNull(
      Option.flatMap(schedule, (schedule) => dayPageOf(schedule, date)),
    ),
  })
}

/**
 * Choosing and restoring a Schedule, and the reads of the Schedules: one
 * Schedule, every Schedule, the Schedule map and summary, Home and a Day page.
 */
export const scheduleMethods = Effect.gen(function* () {
  const { all } = yield* Itineraries
  const { byOptionNumber, scheduleDetail } = yield* CatalogueLookups
  const summaries = all.map(summaryOf)

  const choose = Effect.fn('Trip.choose')(
    function* ({ operationId, optionNumber, replacing }: ChooseItinerary) {
      const store = yield* scheduleStore

      return yield* store.transaction(
        Effect.gen(function* () {
          const recorded =
            yield* store.recordedResult(ScheduleChosen)(operationId)

          if (Option.isSome(recorded)) return recorded.value.result
          const itinerary = yield* find(byOptionNumber, optionNumber)
          const now = isoInstantOf(yield* DateTime.now)
          yield* archiveReplaced(store, replacing, now)
          const scheduleId = ScheduleId.make(crypto.randomUUID())
          yield* store.insert(
            {
              id: scheduleId,
              status: 'current',
              sourceOptionNumber: itinerary.optionNumber,
              sourceContentVersion: itinerary.contentVersion,
              chosenAt: now,
              archivedAt: null,
              birthdayOutline: itinerary.birthdayOutline,
            },
            copyOf(itinerary),
          )
          const chosen = { scheduleId }
          yield* store.recordResult(ScheduleChosen)({
            id: operationId,
            result: chosen,
          })

          return chosen
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const restore = Effect.fn('Trip.restore')(
    function* ({ operationId, scheduleId, replacing }: RestoreSchedule) {
      const store = yield* scheduleStore

      return yield* store.transaction(
        Effect.gen(function* () {
          const recorded =
            yield* store.recordedResult(ScheduleRestored)(operationId)

          if (Option.isSome(recorded)) return recorded.value.result
          const restoring = yield* store.recordById(scheduleId)

          if (Option.isNone(restoring)) {
            return yield* new ScheduleNotFound({ scheduleId })
          }

          const alreadyCurrent = restoring.value.status === 'current'

          if (alreadyCurrent) {
            yield* requireCurrent(store, replacing)
          } else {
            const now = isoInstantOf(yield* DateTime.now)
            yield* archiveReplaced(store, replacing, now)
            yield* store.makeCurrent(scheduleId)
          }

          const restored = { scheduleId }
          yield* store.recordResult(ScheduleRestored)({
            id: operationId,
            result: restored,
          })

          return restored
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const schedule = Effect.fn('Trip.schedule')(
    function* (scheduleId: ScheduleId) {
      const store = yield* scheduleStore
      const found = yield* store.transaction(store.scheduleById(scheduleId))

      if (Option.isNone(found)) {
        return yield* new ScheduleNotFound({ scheduleId })
      }

      return scheduleDetail(found.value)
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const schedules = Effect.gen(function* () {
    const store = yield* scheduleStore

    const { current, archived, tripNote } = yield* store.transaction(
      Effect.all({
        current: store.current,
        archived: store.archived,
        tripNote: store.tripNote,
      }),
    )

    return {
      current: Option.map(current, scheduleDetail),
      archived,
      ...Option.match(tripNote, {
        onNone: () => ({}),
        onSome: (tripNote) => ({ tripNote }),
      }),
    }
  }).pipe(
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan('Trip.schedules'),
  )

  const scheduleMap = Effect.gen(function* () {
    const store = yield* scheduleStore
    const current = yield* store.transaction(store.current)

    return Option.map(current, ({ copy }) => scheduleMapOf(copy))
  }).pipe(
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan('Trip.scheduleMap'),
  )

  const scheduleSummary = Effect.gen(function* () {
    const store = yield* scheduleStore
    const current = yield* store.currentRecord

    return Option.map(current, (schedule) =>
      Struct.pick(schedule, ['id', 'sourceOptionNumber']),
    )
  }).pipe(
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan('Trip.scheduleSummary'),
  )

  const currentSchedule = Effect.gen(function* () {
    const store = yield* scheduleStore
    const current = yield* store.transaction(store.current)

    return Option.map(current, scheduleDetail)
  }).pipe(Effect.catchTag(['SqlError', 'SchemaError'], Effect.die))

  const home = Effect.gen(function* () {
    const now = yield* DateTime.now

    return homeStateOf(now, yield* currentSchedule, summaries)
  }).pipe(Effect.withSpan('Trip.home'))

  const day = Effect.fn('Trip.day')(function* (date: IsoDate) {
    if (!isTripDate(date)) return yield* new DayNotFound({ date })
    const schedule = yield* currentSchedule

    return Option.flatMap(schedule, (schedule) => dayPageOf(schedule, date))
  })

  return {
    home,
    day,
    choose,
    restore,
    schedule,
    schedules,
    scheduleMap,
    scheduleSummary,
  }
})
