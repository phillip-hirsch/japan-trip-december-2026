import { Context, DateTime, Duration, Effect, Layer, Struct } from 'effect'

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
  BaseNights,
  Countdown,
  HomeState,
  IsoDate,
  Itinerary,
  ItineraryDetail,
  ItinerarySummary,
  MoveDetail,
  Place,
  Stay,
  Station,
  TripRuleBreak,
  VerifyClaimAttachment,
  VerifyClaimDetail,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { places, visitedPlaceIds } from '@/trip/places'
import type { PlaceId } from '@/trip/places'
import { stations } from '@/trip/rail'
import type { StationId } from '@/trip/rail'

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

/** The dates where one Stay checks out and the next checks in. */
const stayBoundariesOf = (stays: ReadonlyArray<Stay>) =>
  stays.slice(1).flatMap((to, index) => {
    const from = stays[index]
    return from?.checkOut === to.checkIn ? [{ date: to.checkIn, from, to }] : []
  })

const stationOf = (id: StationId): Station => ({ id, ...stations[id] })

/** Each Move with the Stays it connects, by date. */
const moveDetailsOf = ({ stays, moves }: Itinerary) =>
  new Map(
    stayBoundariesOf(stays).flatMap(({ date, from, to }) => {
      const move = moves.find((move) => move.date === date)
      if (move === undefined) return []
      const sections = move.sections.map((section) => ({
        ...section,
        from: stationOf(section.from),
        to: stationOf(section.to),
      }))
      const detail: MoveDetail = {
        mode: move.mode,
        from: placeOf(from.base),
        to: placeOf(to.base),
        sections,
        ...(move.duration && { duration: move.duration }),
        changes: sections.slice(1).map((section) => section.from),
      }
      return [[date, detail] as const]
    }),
  )

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

/** One key per place a Verify claim can attach to, for matching. */
const attachmentKey = (attachedTo: VerifyClaimAttachment) => {
  switch (attachedTo._tag) {
    case 'Day':
      return `Day ${attachedTo.date}`
    case 'Stay':
      return `Stay ${attachedTo.checkIn}`
    case 'Itinerary':
      return 'Itinerary'
  }
}

/** The Verify claims attached to one place, without their attachment. */
const claimsAttachedTo = (
  { verifyClaims }: Itinerary,
  attachment: VerifyClaimAttachment,
): Array<VerifyClaimDetail> =>
  verifyClaims
    .filter(
      (claim) => attachmentKey(claim.attachedTo) === attachmentKey(attachment),
    )
    .map(({ id, text }) => ({ id, text }))

const nightsPerBaseOf = (stays: ReadonlyArray<Stay>): Array<BaseNights> => {
  const nights = new Map<PlaceId, number>()
  for (const { base, checkIn, checkOut } of stays) {
    nights.set(base, (nights.get(base) ?? 0) + daysBetween(checkIn, checkOut))
  }
  return Array.from(nights, ([base, nights]) => ({
    base: placeOf(base),
    nights,
  }))
}

const newToYouOf = ({ stays, dayTrips }: Itinerary): Array<Place> => {
  const visits = [
    ...stays.map((stay) => ({ date: stay.checkIn, place: stay.base })),
    ...dayTrips.map(({ date, place }) => ({ date, place })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  return Array.from(new Set(visits.map((visit) => visit.place)))
    .map(placeOf)
    .filter((place) => place.newPlace)
}

const summaryOf = (itinerary: Itinerary): ItinerarySummary => ({
  optionNumber: itinerary.optionNumber,
  name: itinerary.name,
  recommended: itinerary.recommended,
  bestFor: itinerary.bestFor,
  route: itinerary.stays
    .filter((stay, index) => stay.base !== itinerary.stays[index - 1]?.base)
    .map((stay) => placeOf(stay.base)),
  nightsPerBase: nightsPerBaseOf(itinerary.stays),
  newToYou: newToYouOf(itinerary),
})

const detailOf = (itinerary: Itinerary): ItineraryDetail => {
  const anchors = anchorsOf(itinerary)
  const moves = moveDetailsOf(itinerary)
  return {
    ...summaryOf(itinerary),
    ...Struct.pick(itinerary, [
      'birthdayOutline',
      'pros',
      'cons',
      'chooseThisIf',
      'whyRecommended',
      'travelNotes',
    ]),
    contentVersion: itinerary.contentVersion,
    verifyClaims: claimsAttachedTo(itinerary, { _tag: 'Itinerary' }),
    stays: itinerary.stays.map((stay) => ({
      ...stay,
      base: placeOf(stay.base),
      nights: daysBetween(stay.checkIn, stay.checkOut),
      verifyClaims: claimsAttachedTo(itinerary, {
        _tag: 'Stay',
        checkIn: stay.checkIn,
      }),
    })),
    days: itinerary.days.map((day) => {
      const dayAnchors = anchors.filter((anchor) => anchor.date === day.date)
      const move = moves.get(day.date)
      const dayTrips = itinerary.dayTrips
        .filter((dayTrip) => dayTrip.date === day.date)
        .map(({ place, optional }) => ({ place: placeOf(place), optional }))
      return {
        ...day,
        anchors: dayAnchors,
        ...(move && { move }),
        dayTrips,
        verifyClaims: claimsAttachedTo(itinerary, {
          _tag: 'Day',
          date: day.date,
        }),
        freeDay:
          day.description === undefined &&
          move === undefined &&
          dayTrips.length === 0 &&
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
  moves,
  verifyClaims,
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
  const boundaryDates = new Set(stayBoundariesOf(stays).map(({ date }) => date))
  const moveDates = new Set(moves.map((move) => move.date))
  for (const date of moveDates) {
    if (!boundaryDates.has(date)) {
      breaks.push({ _tag: 'MoveWithoutStayBoundary', date })
    }
  }
  for (const date of boundaryDates) {
    if (!moveDates.has(date)) {
      breaks.push({ _tag: 'StayBoundaryWithoutMove', date })
    }
  }
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
  if (moveDates.has(birthdayDate)) {
    breaks.push({ _tag: 'MoveOnBirthday' })
  }
  const attachments = new Set(
    [
      { _tag: 'Itinerary' as const },
      ...days.map(({ date }) => ({ _tag: 'Day' as const, date })),
      ...stays.map(({ checkIn }) => ({ _tag: 'Stay' as const, checkIn })),
    ].map(attachmentKey),
  )
  for (const { id, attachedTo } of verifyClaims) {
    if (!attachments.has(attachmentKey(attachedTo))) {
      breaks.push({ _tag: 'UnattachedVerifyClaim', id })
    }
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
      const summaries = all.map(summaryOf)
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
