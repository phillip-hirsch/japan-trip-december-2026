import { DateTime, Effect, Option, Struct } from 'effect'

import { isTripDate, tokyoDateAt, tripEndDate } from '@/trip/domain/calendar'
import {
  DayNotFound,
  Hotel,
  IsoInstant,
  ScheduleChosen,
  ScheduleId,
  ScheduleNotFound,
  ScheduleRestored,
} from '@/trip/domain/domain'
import type {
  ChooseItinerary,
  DayPage,
  IsoDate,
  Itinerary,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleMap,
  ScheduleRecord,
  ScheduleSnapshot,
} from '@/trip/domain/domain'
import { homeStateOn } from '@/trip/domain/home-state'
import { stayForNight } from '@/trip/domain/schedule-copy'
import type { ScheduleCopy } from '@/trip/domain/schedule-copy'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import type { ScheduleStore } from '@/trip/schedule-store/schedule-store'
import { checklistIn } from '@/trip/trip/Trip.checklist'
import { currentIn, scheduleWrite } from '@/trip/trip/Trip.guards'
import { mapOf } from '@/trip/trip/Trip.itinerary'
import {
  anchorsOf,
  CatalogueLookups,
  find,
  staySummaryOf,
} from '@/trip/trip/Trip.shared'

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

/** A fresh copy of the Itinerary, every copied entity with a new id. */
export const copyOf = (itinerary: Itinerary): ScheduleCopy => {
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

/** A fresh current Schedule's record, copied from the Itinerary at `now`. */
export const currentScheduleOf = (
  itinerary: Itinerary,
  now: IsoInstant,
): ScheduleRecord => ({
  id: ScheduleId.make(crypto.randomUUID()),
  status: 'current',
  sourceOptionNumber: itinerary.optionNumber,
  sourceContentVersion: itinerary.contentVersion,
  chosenAt: now,
  archivedAt: null,
  birthdayOutline: itinerary.birthdayOutline,
})

export const isoInstantOf = (now: DateTime.DateTime) =>
  IsoInstant.make(DateTime.formatIso(now))

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

const homeStateOf = Effect.fnUntraced(function* (
  now: DateTime.DateTime,
  schedule: ScheduleDetail,
) {
  const date = tokyoDateAt(DateTime.toEpochMillis(now))

  const home = homeStateOn(date, {
    readAt: DateTime.formatIso(now),
    schedule,
    today: Option.getOrUndefined(findDayPage(schedule, date)),
  })

  if (home === undefined) {
    return yield* Effect.die(new Error(`The Schedule has no Day on ${date}`))
  }

  return home
})

/**
 * Choosing and restoring a Schedule, and the reads of the Schedules: one
 * Schedule, every Schedule, the Schedule snapshot, the Schedule map and
 * summary, Home and a Day page.
 */
export const scheduleMethods = Effect.gen(function* () {
  const { byOptionNumber, scheduleDetail } = yield* CatalogueLookups

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
          const schedule = currentScheduleOf(itinerary, now)
          yield* store.insert(schedule, copyOf(itinerary))

          return { scheduleId: schedule.id }
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
      current: currentIn(store),
      archived: store.archived,
      tripNote: store.tripNote,
    })

    const schedules = {
      current: scheduleDetail(current),
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

        const { current } = schedules

        return {
          schedules,
          days: current.days.map((day) => dayPageFor(current, day)),
          checklist,
        } satisfies ScheduleSnapshot
      }),
    )
  }).pipe(
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
    Effect.withSpan('Trip.scheduleSnapshot'),
  )

  const scheduleMap = Effect.gen(function* () {
    const store = yield* scheduleStore
    const { copy } = yield* store.transaction(currentIn(store))

    return scheduleMapOf(copy)
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
    const current = yield* store.transaction(currentIn(store))

    return scheduleDetail(current)
  }).pipe(Effect.catchTag(['SqlError', 'SchemaError'], Effect.die))

  const home = Effect.gen(function* () {
    const now = yield* DateTime.now

    return yield* homeStateOf(now, yield* currentSchedule)
  }).pipe(Effect.withSpan('Trip.home'))

  const day = Effect.fn('Trip.day')(function* (date: IsoDate) {
    if (!isTripDate(date)) return yield* new DayNotFound({ date })
    const schedule = yield* currentSchedule
    const page = findDayPage(schedule, date)

    if (Option.isNone(page)) {
      return yield* Effect.die(new Error(`The Schedule has no Day on ${date}`))
    }

    return page.value
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
