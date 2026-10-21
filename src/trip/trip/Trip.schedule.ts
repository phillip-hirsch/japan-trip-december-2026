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
  ScheduleSnapshot,
} from '@/trip/domain/domain'
import { Itineraries } from '@/trip/itineraries/Itineraries'
import { stayForNight } from '@/trip/domain/schedule-copy'
import type { ScheduleCopy } from '@/trip/domain/schedule-copy'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import type { ScheduleStore } from '@/trip/schedule-store/schedule-store'
import { checklistIn } from '@/trip/trip/Trip.checklist'
import { scheduleWrite } from '@/trip/trip/Trip.guards'
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

const dayPageFor = (
  schedule: ScheduleDetail,
  day: ScheduleDetail['days'][number],
): DayPage => {
  const tonight = isDepartureDay(day.date)
    ? undefined
    : stayForNight(schedule.stays, day.date)

  const nextMove = firstMoveOnOrAfter(schedule.days, day.date)

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
}

const findDayPage = (schedule: ScheduleDetail, date: IsoDate) =>
  Option.map(
    Option.fromUndefinedOr(schedule.days.find((day) => day.date === date)),
    (day) => dayPageFor(schedule, day),
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
      Option.flatMap(schedule, (schedule) => findDayPage(schedule, date)),
    ),
  })
}

/**
 * Choosing and restoring a Schedule, and the reads of the Schedules: one
 * Schedule, every Schedule, the Schedule snapshot, the Schedule map and
 * summary, Home and a Day page.
 */
export const scheduleMethods = Effect.gen(function* () {
  const { all } = yield* Itineraries
  const { byOptionNumber, scheduleDetail } = yield* CatalogueLookups
  const summaries = all.map(summaryOf)

  /** Archives the current Schedule a choose or restore names, if any. */
  const archiveReplaced = (
    store: ScheduleStore,
    replacing: ScheduleId | null,
    archivedAt: IsoInstant,
  ) => (replacing === null ? Effect.void : store.archive(replacing, archivedAt))

  const choose = Effect.fn('Trip.choose')(function* ({
    operationId,
    optionNumber,
    replacing,
  }: ChooseItinerary) {
    return yield* scheduleWrite(
      { naming: replacing, recorded: { operationId, result: ScheduleChosen } },
      (store) =>
        Effect.gen(function* () {
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

          return { scheduleId }
        }),
    )
  })

  const restore = Effect.fn('Trip.restore')(function* ({
    operationId,
    scheduleId,
    replacing,
  }: RestoreSchedule) {
    return yield* scheduleWrite(
      {
        naming: replacing,
        recorded: { operationId, result: ScheduleRestored },
      },
      (store) =>
        Effect.gen(function* () {
          const restoring = yield* store.recordById(scheduleId)

          if (Option.isNone(restoring)) {
            return yield* new ScheduleNotFound({ scheduleId })
          }

          if (restoring.value.status !== 'current') {
            const now = isoInstantOf(yield* DateTime.now)
            yield* archiveReplaced(store, replacing, now)
            yield* store.makeCurrent(scheduleId)
          }

          return { scheduleId }
        }),
    )
  })

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

  /**
   * Reads the Schedules inside the caller's transaction. It also returns the
   * current Schedule as stored, for reads that derive more from it.
   */
  const schedulesIn = Effect.fnUntraced(function* (store: ScheduleStore) {
    const { current, archived, tripNote } = yield* Effect.all({
      current: store.current,
      archived: store.archived,
      tripNote: store.tripNote,
    })

    const schedules = {
      current: Option.map(current, scheduleDetail),
      archived,
      ...Option.match(tripNote, {
        onNone: () => ({}),
        onSome: (tripNote) => ({ tripNote }),
      }),
    }

    return { schedules, storedCurrent: current }
  })

  const schedules = Effect.gen(function* () {
    const store = yield* scheduleStore
    const { schedules } = yield* store.transaction(schedulesIn(store))

    return schedules
  }).pipe(
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan('Trip.schedules'),
  )

  const scheduleSnapshot = Effect.gen(function* () {
    const store = yield* scheduleStore

    return yield* store.transaction(
      Effect.gen(function* () {
        const { schedules, storedCurrent } = yield* schedulesIn(store)
        const checklist = yield* checklistIn(store, storedCurrent)

        return Option.map(schedules.current, (current): ScheduleSnapshot => ({
          schedules: { ...schedules, current },
          days: current.days.map((day) => dayPageFor(current, day)),
          checklist,
        }))
      }),
    )
  }).pipe(
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan('Trip.scheduleSnapshot'),
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

    return Option.flatMap(schedule, (schedule) => findDayPage(schedule, date))
  })

  return {
    home,
    day,
    choose,
    restore,
    schedule,
    schedules,
    scheduleSnapshot,
    scheduleMap,
    scheduleSummary,
  }
})
