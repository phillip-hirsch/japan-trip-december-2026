import { Context, DateTime, Duration, Effect, Layer } from 'effect'

import {
  birthdayDate,
  shigeharuDate,
  tripEndDate,
  tripStartDate,
  tripTimeZone,
} from '@/trip/calendar'
import { ItineraryNotFound } from '@/trip/domain'
import type {
  Anchor,
  Countdown,
  HomeState,
  IsoDate,
  Itinerary,
  ItineraryDetail,
  ItinerarySummary,
  Place,
  Stay,
  TripRuleBreak,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { places, visitedPlaceIds } from '@/trip/places'
import type { PlaceId } from '@/trip/places'

const tripStart = DateTime.makeUnsafe(tripStartDate)

const countdownAt = (now: DateTime.DateTime): Countdown => {
  const today = DateTime.removeTime(
    DateTime.setZoneNamedUnsafe(now, tripTimeZone),
  )
  const days = Math.round(Duration.toDays(DateTime.distance(today, tripStart)))
  return days > 0 ? { _tag: 'Counting', days } : { _tag: 'Ended' }
}

const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round(
    Duration.toDays(
      DateTime.distance(DateTime.makeUnsafe(from), DateTime.makeUnsafe(to)),
    ),
  )

const addDays = (date: IsoDate, days: number) =>
  DateTime.formatIsoDate(
    DateTime.add(DateTime.makeUnsafe(date), { days }),
  ) as IsoDate

/** December 6 through December 20. */
const tripDates = Array.from(
  { length: daysBetween(tripStartDate, tripEndDate) + 1 },
  (_, index) => addDays(tripStartDate, index),
)

/** The Thursday before the Shigeharu visit, its backup morning. */
const thursdayBeforeShigeharu = addDays(shigeharuDate, -1)

const placeOf = (id: PlaceId): Place => ({
  id,
  ...places[id],
  newPlace: !visitedPlaceIds.has(id),
})

/** The Stay whose hotel Phillip sleeps in on the night starting on a date. */
const stayForNight = (stays: ReadonlyArray<Stay>, date: IsoDate) =>
  stays.find((stay) => stay.checkIn <= date && date < stay.checkOut)

/**
 * The Moves between Stays. Until Moves are content, a Move is inferred from
 * a Stay boundary: a check-out and the next check-in on the same date.
 */
const movesOf = (stays: ReadonlyArray<Stay>) =>
  stays.slice(1).flatMap((to, index) => {
    const from = stays[index]
    return from?.checkOut === to.checkIn
      ? [{ date: to.checkIn, from: from.base, to: to.base }]
      : []
  })

/**
 * Whether Thursday, December 10 is a whole day in Kyoto and not a Move day,
 * so the Shigeharu visit can fall back to it: a Kyoto Stay checks in on or
 * before December 9 and checks out on or after December 11.
 */
const hasThursdayBackup = (stays: ReadonlyArray<Stay>) =>
  stays.some(
    (stay) =>
      stay.base === 'kyoto' &&
      stay.checkIn < thursdayBeforeShigeharu &&
      stay.checkOut > thursdayBeforeShigeharu,
  )

const anchorsOf = ({ stays, shigeharuVisit }: Itinerary): Array<Anchor> => [
  { _tag: 'Arrival', date: tripStartDate },
  ...(shigeharuVisit
    ? [
        {
          _tag: 'ShigeharuVisit' as const,
          ...shigeharuVisit,
          tentative: true as const,
          thursdayBackup: hasThursdayBackup(stays),
        },
      ]
    : []),
  { _tag: 'Birthday', date: birthdayDate },
  { _tag: 'Departure', date: tripEndDate },
]

const detailOf = (itinerary: Itinerary): ItineraryDetail => {
  const anchors = anchorsOf(itinerary)
  const moves = movesOf(itinerary.stays)
  return {
    optionNumber: itinerary.optionNumber,
    name: itinerary.name,
    contentVersion: itinerary.contentVersion,
    stays: itinerary.stays.map((stay) => ({
      ...stay,
      base: placeOf(stay.base),
      nights: daysBetween(stay.checkIn, stay.checkOut),
    })),
    days: itinerary.days.map((day) => {
      const dayAnchors = anchors.filter((anchor) => anchor.date === day.date)
      const move = moves.find((move) => move.date === day.date)
      return {
        ...day,
        anchors: dayAnchors,
        ...(move && {
          move: { from: placeOf(move.from), to: placeOf(move.to) },
        }),
        freeDay:
          day.description === undefined &&
          move === undefined &&
          !dayAnchors.some(
            (anchor) =>
              anchor._tag === 'Arrival' || anchor._tag === 'Departure',
          ),
      }
    }),
  }
}

/** Every way an Itinerary breaks the Trip's rules; empty when it keeps them. */
const tripRuleBreaksOf = ({
  stays,
  days,
  shigeharuVisit,
}: Itinerary): Array<TripRuleBreak> => {
  const first = stays[0]
  const last = stays.at(-1)
  if (first === undefined || last === undefined) return [{ _tag: 'NoStays' }]

  const breaks: Array<TripRuleBreak> = []
  if (first.checkIn !== tripStartDate || last.checkOut !== tripEndDate) {
    breaks.push({
      _tag: 'NotTheTripDates',
      checkIn: first.checkIn,
      checkOut: last.checkOut,
    })
  }
  for (const stay of stays) {
    if (stay.checkOut <= stay.checkIn) {
      breaks.push({ _tag: 'StayWithoutNights', checkIn: stay.checkIn })
    }
  }
  stays.slice(1).forEach((next, index) => {
    const previous = stays[index]
    if (previous === undefined) return
    if (previous.checkOut < next.checkIn) {
      breaks.push({ _tag: 'Gap', from: previous.checkOut, to: next.checkIn })
    } else if (next.checkIn < previous.checkOut) {
      breaks.push({
        _tag: 'Overlap',
        from: next.checkIn,
        to: previous.checkOut,
      })
    }
  })
  const dates = days.map((day) => day.date)
  if (dates.join() !== tripDates.join()) {
    breaks.push({ _tag: 'NotTheTripDays', dates })
  }
  const shigeharuEve = stayForNight(stays, thursdayBeforeShigeharu)
  if (shigeharuEve?.base !== 'kyoto') {
    breaks.push({
      _tag: 'NotWakingUpInKyoto',
      ...(shigeharuEve && { base: shigeharuEve.base }),
    })
  }
  if (shigeharuVisit === undefined) {
    breaks.push({ _tag: 'ShigeharuMissing' })
  } else {
    if (shigeharuVisit.date !== shigeharuDate) {
      breaks.push({ _tag: 'ShigeharuWrongDate', date: shigeharuVisit.date })
    }
    if (shigeharuVisit.slot !== 'morning') {
      breaks.push({ _tag: 'ShigeharuNotInMorning', slot: shigeharuVisit.slot })
    }
  }
  if (movesOf(stays).some((move) => move.date === birthdayDate)) {
    breaks.push({ _tag: 'MoveOnBirthday' })
  }
  if (last.base !== 'tokyo') {
    breaks.push({ _tag: 'EndsOutsideTokyo', base: last.base })
  }
  return breaks
}

/** The application seam: all Trip behaviour, independent of HTTP and React. */
export class Trip extends Context.Service<
  Trip,
  {
    /** Home's state at the current moment of the Clock. */
    readonly home: Effect.Effect<HomeState>
    readonly itineraries: Effect.Effect<ReadonlyArray<ItinerarySummary>>
    /** One Itinerary with its Stays and all 15 Days. */
    itinerary(
      optionNumber: number,
    ): Effect.Effect<ItineraryDetail, ItineraryNotFound>
    /**
     * How an Itinerary breaks the Trip's rules. Only the tests call this, over
     * every Itinerary: content is trusted at runtime and never re-checked.
     */
    tripRuleBreaks(
      optionNumber: number,
    ): Effect.Effect<ReadonlyArray<TripRuleBreak>, ItineraryNotFound>
  }
>()('japan-trip/trip/Trip') {
  static readonly layer = Layer.effect(
    Trip,
    Effect.gen(function* () {
      const { all } = yield* Itineraries
      const summaries = all.map(({ optionNumber, name }) => ({
        optionNumber,
        name,
      }))
      const byOptionNumber = new Map(
        all.map((itinerary) => [itinerary.optionNumber, itinerary]),
      )
      // Content never changes while the Worker runs, so derive it once.
      const details = new Map(
        all.map((itinerary) => [itinerary.optionNumber, detailOf(itinerary)]),
      )

      const find = Effect.fnUntraced(function* <A>(
        entries: ReadonlyMap<number, A>,
        optionNumber: number,
      ) {
        const found = entries.get(optionNumber)
        if (found === undefined) {
          return yield* new ItineraryNotFound({ optionNumber })
        }
        return found
      })

      return Trip.of({
        home: Effect.map(DateTime.now, (now) => ({
          countdown: countdownAt(now),
          itineraries: summaries,
        })),
        itineraries: Effect.succeed(summaries),
        itinerary: (optionNumber) => find(details, optionNumber),
        tripRuleBreaks: (optionNumber) =>
          find(byOptionNumber, optionNumber).pipe(Effect.map(tripRuleBreaksOf)),
      })
    }),
  )
}
