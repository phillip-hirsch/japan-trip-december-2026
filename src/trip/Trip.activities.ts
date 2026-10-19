import { DateTime, Duration, Effect, Option } from 'effect'

import { timeOfDayOf, tripTimeZone } from '@/trip/calendar'
import {
  ActivityAdded,
  ActivityNotFound,
  CoordinatesOutsideJapan,
  DayNotFound,
  LocationLinkRefused,
  NoCoordinatesInLink,
  TokyoDateTime,
} from '@/trip/domain'
import type {
  Activity,
  AddActivity,
  Coordinates,
  EditActivity,
  IsoDate,
  MoveActivity,
  Pin,
  RemoveActivity,
  ResolveLocationLink,
  ScheduleId,
  SetPin,
  TimeOfDay,
} from '@/trip/domain'
import { LocationLinkResolver } from '@/trip/LocationLinkResolver'
import {
  coordinatesInUrl,
  googleMapsUrlOf,
  isInJapan,
  isShortLink,
  linkRefusalOf,
} from '@/trip/pins'
import { scheduleStore } from '@/trip/schedule-store'
import type { ScheduleStore } from '@/trip/schedule-store'
import {
  requireActivityTitle,
  requireCurrent,
  requireNoteLength,
  requireStay,
} from '@/trip/Trip.guards'

/**
 * An Activity's time: the time of day in Tokyo on its Day's date, as a zoned
 * date-time. Tokyo keeps UTC+9 all year, so every time of day exists once.
 */
const activityTimeOf = (date: IsoDate, time: TimeOfDay) =>
  TokyoDateTime.make(
    DateTime.formatIsoZoned(
      DateTime.makeZonedUnsafe(`${date}T${time}:00`, {
        timeZone: tripTimeZone,
        adjustForTimeZone: true,
      }),
    ),
  )

const insertionIndexOf = (
  activities: ReadonlyArray<Activity>,
  time: TimeOfDay | undefined,
) => {
  const later =
    time === undefined
      ? -1
      : activities.findIndex(
          (activity) =>
            activity.time !== undefined && timeOfDayOf(activity.time) > time,
        )

  return later === -1 ? activities.length : later
}

const requireGoogleMapsUrl = (link: string) => {
  const refusal = linkRefusalOf(link)
  const url = googleMapsUrlOf(link)

  return refusal === undefined && url !== undefined
    ? Effect.succeed(url)
    : Effect.fail(
        new LocationLinkRefused({ reason: refusal ?? 'NotGoogleMaps' }),
      )
}

const requireInJapan = (coordinates: Coordinates) =>
  isInJapan(coordinates)
    ? Effect.succeed(coordinates)
    : Effect.fail(new CoordinatesOutsideJapan({ coordinates }))

const maxRedirects = 5

const linkTimeout = Duration.seconds(10)

const coordinatesOfLink = Effect.fnUntraced(function* (
  resolver: LocationLinkResolver['Service'],
  link: string,
) {
  let url = yield* requireGoogleMapsUrl(link)

  for (let redirects = 0; isShortLink(url); redirects++) {
    if (redirects === maxRedirects) {
      return yield* new LocationLinkRefused({ reason: 'TooManyRedirects' })
    }

    const { status, location } = yield* resolver
      .request(url)
      .pipe(
        Effect.catchTag('LinkRequestFailed', () =>
          Effect.fail(new LocationLinkRefused({ reason: 'Unreachable' })),
        ),
      )

    if (status < 300 || status > 399 || location === undefined) {
      return yield* new LocationLinkRefused({ reason: 'Unreachable' })
    }

    const next = googleMapsUrlOf(location, url)

    if (next === undefined) {
      return yield* new LocationLinkRefused({ reason: 'LeftGoogleMaps' })
    }

    url = next
  }

  const coordinates = coordinatesInUrl(url)

  if (coordinates === undefined) return yield* new NoCoordinatesInLink()

  return yield* requireInJapan(coordinates)
})

const requirePin = Effect.fnUntraced(function* (pin: Pin) {
  if (pin.link !== undefined) yield* requireGoogleMapsUrl(pin.link)
  yield* requireInJapan(pin.coordinates)

  return pin
})

/**
 * The Activity writes, resolving a Google Maps link and setting a Pin on an
 * Activity or a Stay's hotel.
 */
export const activityMethods = Effect.gen(function* () {
  const resolver = yield* LocationLinkResolver

  const addActivity = Effect.fn('Trip.addActivity')(
    function* ({
      operationId,
      scheduleId,
      date,
      title,
      time,
      note = '',
    }: AddActivity) {
      const trimmed = yield* requireActivityTitle(title)
      yield* requireNoteLength(note)
      const store = yield* scheduleStore

      return yield* store.transaction(
        Effect.gen(function* () {
          const recorded =
            yield* store.recordedResult(ActivityAdded)(operationId)

          if (Option.isSome(recorded)) return recorded.value.result
          yield* requireCurrent(store, scheduleId)

          if (!(yield* store.hasDay(scheduleId, date))) {
            return yield* new DayNotFound({ date })
          }

          const activity: Activity = {
            id: crypto.randomUUID(),
            title: trimmed,
            ...(time !== undefined && { time: activityTimeOf(date, time) }),
            ...(note !== '' && { note }),
          }

          const activities = yield* store.activitiesOn(scheduleId, date)
          const ids = activities.map(({ id }) => id)
          ids.splice(insertionIndexOf(activities, time), 0, activity.id)
          yield* store.addActivity(scheduleId, date, activity, ids.length)
          yield* store.writeActivityOrder(scheduleId, ids)
          const added = { activityId: activity.id }
          yield* store.recordResult(ActivityAdded)({
            id: operationId,
            result: added,
          })

          return added
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const requireActivityDay = Effect.fnUntraced(function* (
    store: ScheduleStore,
    scheduleId: ScheduleId,
    activityId: string,
  ) {
    yield* requireCurrent(store, scheduleId)
    const date = yield* store.activityDate(scheduleId, activityId)

    if (Option.isNone(date)) {
      return yield* new ActivityNotFound({ activityId })
    }

    return date.value
  })

  const editActivity = Effect.fn('Trip.editActivity')(
    function* ({ scheduleId, activityId, title, time, note }: EditActivity) {
      const trimmed =
        title === undefined ? undefined : yield* requireActivityTitle(title)

      if (note !== undefined) yield* requireNoteLength(note)
      const store = yield* scheduleStore
      yield* store.transaction(
        Effect.gen(function* () {
          const date = yield* requireActivityDay(store, scheduleId, activityId)

          yield* store.editActivity(scheduleId, activityId, {
            ...(trimmed !== undefined && { title: trimmed }),
            ...(time !== undefined && {
              time: time === null ? null : activityTimeOf(date, time),
            }),
            ...(note !== undefined && { note }),
          })
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const removeActivity = Effect.fn('Trip.removeActivity')(
    function* ({ scheduleId, activityId }: RemoveActivity) {
      const store = yield* scheduleStore
      yield* store.transaction(
        Effect.gen(function* () {
          yield* requireActivityDay(store, scheduleId, activityId)
          yield* store.removeActivity(scheduleId, activityId)
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const moveActivity = Effect.fn('Trip.moveActivity')(
    function* ({ scheduleId, activityId, before }: MoveActivity) {
      const store = yield* scheduleStore
      yield* store.transaction(
        Effect.gen(function* () {
          const date = yield* requireActivityDay(store, scheduleId, activityId)

          const ids = (yield* store.activitiesOn(scheduleId, date)).map(
            ({ id }) => id,
          )

          if (before !== null && !ids.includes(before)) {
            return yield* new ActivityNotFound({ activityId: before })
          }

          if (before === activityId) return
          const rest = ids.filter((id) => id !== activityId)
          const index = before === null ? rest.length : rest.indexOf(before)
          rest.splice(index, 0, activityId)
          yield* store.writeActivityOrder(scheduleId, rest)
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const resolveLocationLink = Effect.fn('Trip.resolveLocationLink')(function* ({
    link,
  }: ResolveLocationLink) {
    return yield* coordinatesOfLink(resolver, link.trim()).pipe(
      Effect.timeoutOrElse({
        duration: linkTimeout,
        orElse: () =>
          Effect.fail(new LocationLinkRefused({ reason: 'TimedOut' })),
      }),
    )
  })

  const setPin = Effect.fn('Trip.setPin')(
    function* ({ scheduleId, target, pin }: SetPin) {
      const confirmed = pin && (yield* requirePin(pin))
      const store = yield* scheduleStore
      yield* store.transaction(
        Effect.gen(function* () {
          if ('activityId' in target) {
            const { activityId } = target
            yield* requireActivityDay(store, scheduleId, activityId)
            yield* store.writeActivityPin(scheduleId, activityId, confirmed)
          } else {
            yield* requireStay(store, scheduleId, target.stayId)
            yield* store.writeHotelPin(scheduleId, target.stayId, confirmed)
          }
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  return {
    addActivity,
    editActivity,
    removeActivity,
    moveActivity,
    resolveLocationLink,
    setPin,
  }
})
