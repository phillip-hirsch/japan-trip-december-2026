import { Effect, Struct } from 'effect'

import { birthdayDate, shigeharuDate, tripDates } from '@/trip/calendar'
import { TripRuleBreak } from '@/trip/domain'
import type {
  BaseNights,
  ComparisonMap,
  Coordinates,
  DayTrip,
  DayTripDetail,
  Itinerary,
  ItineraryComparison,
  ItineraryDetail,
  ItineraryMap,
  ItinerarySummary,
  MapDayTrip,
  MapRailSection,
  MovesComparison,
  MoveSummary,
  Place,
  RailSectionDetail,
  Stay,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import type { PlaceId } from '@/trip/catalogue-ids'
import { railSectionIdsOf, undirectedRailSectionKey } from '@/trip/rail'
import { railGeometryAttribution, railGeometryOf } from '@/trip/rail-geometry'
import {
  anchorWarningsOf,
  fitBreaksOf,
  stayDateRuleBreaksOf,
  stayForNight,
} from '@/trip/schedule-copy'
import {
  anchorsOf,
  CatalogueLookups,
  find,
  hasThursdayBackup,
  moveDetailsOf,
  nightsOf,
  placeOf,
  staySummaryOf,
  staysAndDaysOf,
} from '@/trip/Trip.shared'

const nightsPerBaseOf = (stays: ReadonlyArray<Stay>): Array<BaseNights> => {
  const nights = new Map<PlaceId, number>()

  for (const stay of stays) {
    nights.set(stay.base, (nights.get(stay.base) ?? 0) + nightsOf(stay))
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

export const summaryOf = (itinerary: Itinerary): ItinerarySummary => ({
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

const datedMovesOf = (plan: Pick<Itinerary, 'stays' | 'moves'>) =>
  Array.from(moveDetailsOf(plan), ([date, move]) => ({ date, ...move }))

type DatedMove = ReturnType<typeof datedMovesOf>[number]

const moveSummaryOf = (move: DatedMove): MoveSummary =>
  Struct.pick(move, ['date', 'mode', 'from', 'to'])

const movesOf = (moves: ReadonlyArray<DatedMove>): MovesComparison => {
  const travelling = moves.filter((move) => move.mode !== 'local')
  const timed = travelling.flatMap((move) => move.duration ?? [])

  return {
    count: moves.length,
    ...(timed.length > 0 && {
      travelTime: {
        minMinutes: timed.reduce((sum, { minMinutes }) => sum + minMinutes, 0),
        maxMinutes: timed.reduce((sum, { maxMinutes }) => sum + maxMinutes, 0),
      },
    }),
    durationNotGiven: travelling.flatMap((move) =>
      move.duration === undefined ? [moveSummaryOf(move)] : [],
    ),
  }
}

const birthdayOf = ({ stays, birthdayOutline }: Itinerary) => {
  const stay = stayForNight(stays, birthdayDate)

  return {
    ...(stay && { base: placeOf(stay.base) }),
    outline: birthdayOutline,
  }
}

const groupedDayTrips = (
  dayTrips: ReadonlyArray<DayTrip>,
  groupOf: (dayTrip: DayTrip) => string | undefined,
) => {
  const groups = new Map<string, Array<DayTrip>>()
  const byDate = [...dayTrips].sort((a, b) => a.date.localeCompare(b.date))

  for (const dayTrip of byDate) {
    const group = groupOf(dayTrip)

    if (group === undefined) continue
    const members = groups.get(group)

    if (members === undefined) groups.set(group, [dayTrip])
    else members.push(dayTrip)
  }

  return Array.from(groups.values(), (members) => ({
    first: members[0],
    optional: members.every((dayTrip) => dayTrip.optional),
  }))
}

const dayTripsOf = ({ dayTrips }: Itinerary): Array<DayTripDetail> =>
  groupedDayTrips(dayTrips, (dayTrip) => dayTrip.place).map(
    ({ first, optional }) => ({ place: placeOf(first.place), optional }),
  )

const flightsOf = (moves: ReadonlyArray<DatedMove>) =>
  moves.flatMap((move) => (move.mode === 'flight' ? [moveSummaryOf(move)] : []))

const comparisonOf = (itinerary: Itinerary): ItineraryComparison => {
  const moves = datedMovesOf(itinerary)

  return {
    ...summaryOf(itinerary),
    birthday: birthdayOf(itinerary),
    moves: movesOf(moves),
    thursdayBackup: hasThursdayBackup(itinerary.stays),
    dayTrips: dayTripsOf(itinerary),
    flights: flightsOf(moves),
    ryokanStays: itinerary.stays
      .filter((stay) => stay.accommodation === 'ryokan')
      .map(staySummaryOf),
  }
}

const withoutConsecutiveRepeats = (path: ReadonlyArray<Coordinates>) =>
  path.filter((point, index) => {
    const previous = path[index - 1]

    return (
      previous?.latitude !== point.latitude ||
      previous.longitude !== point.longitude
    )
  })

const mapDayTripsOf = ({
  stays,
  dayTrips,
}: Pick<Itinerary, 'stays' | 'dayTrips'>): Array<MapDayTrip> => {
  const baseOf = (dayTrip: DayTrip) => stayForNight(stays, dayTrip.date)?.base

  return groupedDayTrips(dayTrips, (dayTrip) => {
    const base = baseOf(dayTrip)

    return base && `${base} ${dayTrip.place}`
  }).flatMap(({ first, optional }) => {
    const base = baseOf(first)

    return base
      ? [{ from: placeOf(base), to: placeOf(first.place), optional }]
      : []
  })
}

const railPathOf = (section: RailSectionDetail) => {
  const path = railGeometryOf(railSectionIdsOf(section))

  return path
    ? { path, followsRailLine: true }
    : {
        path: [section.from.coordinates, section.to.coordinates],
        followsRailLine: false,
      }
}

const drawsOnTheGround = (move: DatedMove) =>
  move.mode !== 'flight' && move.from.id !== move.to.id

export const mapOf = (
  plan: Pick<Itinerary, 'stays' | 'moves' | 'dayTrips'>,
): ItineraryMap => {
  const moves = datedMovesOf(plan)

  const trainMoves = moves
    .filter(drawsOnTheGround)
    .map((move) => ({ move, railPaths: move.sections.map(railPathOf) }))

  return {
    bases: Array.from(new Set(plan.stays.map((stay) => stay.base))).map(
      placeOf,
    ),
    trainMoves: trainMoves.map(({ move, railPaths }) => ({
      date: move.date,
      path: withoutConsecutiveRepeats([
        move.from.coordinates,
        ...railPaths.flatMap((railPath) => railPath.path),
        move.to.coordinates,
      ]),
    })),
    flights: flightsOf(moves),
    dayTrips: mapDayTripsOf(plan),
    ...(trainMoves.some(({ railPaths }) =>
      railPaths.some((railPath) => railPath.followsRailLine),
    ) && { railAttribution: railGeometryAttribution }),
  }
}

const comparisonMapOf = (
  details: ReadonlyArray<ItineraryDetail>,
): ComparisonMap => {
  const railAttribution = details
    .map(({ map }) => map.railAttribution)
    .find(Boolean)

  return {
    bases: Array.from(
      new Map(
        details.flatMap(({ map }) => map.bases).map((base) => [base.id, base]),
      ).values(),
    ),
    itineraries: details.map(({ optionNumber, recommended, map }) => ({
      optionNumber,
      recommended,
      trainMoves: map.trainMoves,
      flights: map.flights,
    })),
    ...(railAttribution && { railAttribution }),
  }
}

const railSectionsOf = (
  itineraries: ReadonlyArray<Itinerary>,
): Array<MapRailSection> => {
  const sections = new Map<string, MapRailSection>()

  for (const move of itineraries.flatMap(datedMovesOf)) {
    for (const section of move.sections) {
      const key = undirectedRailSectionKey(railSectionIdsOf(section))

      if (sections.has(key)) continue
      const { followsRailLine } = railPathOf(section)
      sections.set(key, { ...section, followsRailLine })
    }
  }

  return Array.from(sections.values())
}

const detailOf = (itinerary: Itinerary): ItineraryDetail => ({
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
  ...staysAndDaysOf({ ...itinerary, anchors: anchorsOf(itinerary) }),
  map: mapOf(itinerary),
})

const anchorWarningsAsBreaks = (itinerary: Itinerary): Array<TripRuleBreak> =>
  anchorWarningsOf(itinerary)

const tripRuleBreaksOf = (itinerary: Itinerary): Array<TripRuleBreak> => {
  const { stays, days, shigeharuVisit } = itinerary
  const stayDateBreaks = stayDateRuleBreaksOf(stays)

  if (stays.length === 0) return stayDateBreaks

  const breaks: Array<TripRuleBreak> = [
    ...stayDateBreaks,
    ...fitBreaksOf(itinerary),
  ]

  const dates = days.map((day) => day.date)

  if (dates.join() !== tripDates.join()) {
    breaks.push(TripRuleBreak.cases.NotTheTripDays.make({ dates }))
  }

  if (shigeharuVisit === undefined) {
    breaks.push(TripRuleBreak.cases.ShigeharuMissing.make({}))
  } else {
    if (shigeharuVisit.date !== shigeharuDate) {
      breaks.push(
        TripRuleBreak.cases.ShigeharuWrongDate.make({
          date: shigeharuVisit.date,
        }),
      )
    }

    if (shigeharuVisit.slot !== 'morning') {
      breaks.push(
        TripRuleBreak.cases.ShigeharuNotInMorning.make({
          slot: shigeharuVisit.slot,
        }),
      )
    }
  }

  return [...breaks, ...anchorWarningsAsBreaks(itinerary)]
}

/**
 * The Itinerary reads: the comparison and its map, one Itinerary's detail,
 * its Trip rule breaks and the rail sections, each derived once from the
 * catalogue.
 */
export const itineraryMethods = Effect.gen(function* () {
  const { all } = yield* Itineraries
  const { byOptionNumber } = yield* CatalogueLookups
  const comparisons = all.map(comparisonOf)
  const railSections = railSectionsOf(all)

  const details = new Map(
    all.map((itinerary) => [itinerary.optionNumber, detailOf(itinerary)]),
  )

  const comparisonMap = comparisonMapOf(Array.from(details.values()))

  return {
    itineraries: Effect.succeed(comparisons),
    comparisonMap: Effect.succeed(comparisonMap),
    itinerary: (optionNumber: number) => find(details, optionNumber),
    tripRuleBreaks: (optionNumber: number) =>
      find(byOptionNumber, optionNumber).pipe(Effect.map(tripRuleBreaksOf)),
    railSections: Effect.succeed(railSections),
  }
})
