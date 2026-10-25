import { Effect, Struct } from 'effect'

import type {
  Coordinates,
  DayTrip,
  ItineraryContent,
  ItineraryMap,
  MapDayTrip,
  MapRailSection,
  MoveSummary,
  RailSectionDetail,
} from '@/trip/domain/domain'
import { Itinerary } from '@/trip/itinerary/Itinerary'
import {
  railSectionIdsOf,
  undirectedRailSectionKey,
} from '@/trip/catalogue/rail'
import {
  railGeometryAttribution,
  railGeometryOf,
} from '@/trip/catalogue/rail-geometry'
import { stayForNight } from '@/trip/domain/schedule-copy'
import { moveDetailsOf, placeOf } from '@/trip/trip/Trip.shared'

const datedMovesOf = (plan: Pick<ItineraryContent, 'stays' | 'moves'>) =>
  Array.from(moveDetailsOf(plan), ([date, move]) => ({ date, ...move }))

type DatedMove = ReturnType<typeof datedMovesOf>[number]

const moveSummaryOf = (move: DatedMove): MoveSummary =>
  Struct.pick(move, ['date', 'mode', 'from', 'to'])

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

const flightsOf = (moves: ReadonlyArray<DatedMove>) =>
  moves.flatMap((move) => (move.mode === 'flight' ? [moveSummaryOf(move)] : []))

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
}: Pick<ItineraryContent, 'stays' | 'dayTrips'>): Array<MapDayTrip> => {
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
  plan: Pick<ItineraryContent, 'stays' | 'moves' | 'dayTrips'>,
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

const railSectionsOf = (itinerary: ItineraryContent): Array<MapRailSection> => {
  const sections = new Map<string, MapRailSection>()

  for (const move of datedMovesOf(itinerary)) {
    for (const section of move.sections) {
      const key = undirectedRailSectionKey(railSectionIdsOf(section))

      if (sections.has(key)) continue
      const { followsRailLine } = railPathOf(section)
      sections.set(key, { ...section, followsRailLine })
    }
  }

  return Array.from(sections.values())
}

/** The rail sections read, derived once from the Itinerary. */
export const itineraryMethods = Effect.gen(function* () {
  const itinerary = yield* Itinerary

  return { railSections: Effect.succeed(railSectionsOf(itinerary)) }
})
