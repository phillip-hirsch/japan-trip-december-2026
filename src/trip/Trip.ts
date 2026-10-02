// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import {
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  Struct,
} from 'effect'
import type { SqlClient } from 'effect/sql'

import {
  birthdayDate,
  shigeharuDate,
  tripEndDate,
  tripStartDate,
  tripTimeZone,
} from '@/trip/calendar'
import {
  ItineraryNotFound,
  ScheduleChanged,
  ScheduleChosen,
  ScheduleNotFound,
  ScheduleRestored,
} from '@/trip/domain'
import type {
  Anchor,
  ArchivedScheduleSummary,
  BaseNights,
  ChooseItinerary,
  ComparisonMap,
  Coordinates,
  Countdown,
  Day,
  DayTrip,
  DayTripDetail,
  HomeState,
  IsoDate,
  Itinerary,
  ItineraryComparison,
  ItineraryDetail,
  ItineraryMap,
  ItinerarySummary,
  MapDayTrip,
  MapRailSection,
  Move,
  MoveDetail,
  MovesComparison,
  MoveSummary,
  Place,
  RailSectionDetail,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleId,
  ScheduleRecord,
  ScheduleSummary,
  SourceItineraryStatus,
  Stay,
  StaySummary,
  Station,
  TripRuleBreak,
  VerifyClaim,
  VerifyClaimAttachment,
  VerifyClaimDetail,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { places, visitedPlaceIds } from '@/trip/places'
import type { PlaceId } from '@/trip/places'
import { railSectionIdsOf, railSectionKey, stations } from '@/trip/rail'
import type { StationId } from '@/trip/rail'
import { railGeometryAttribution, railGeometryOf } from '@/trip/rail-geometry'
import { scheduleStore } from '@/trip/schedule-store'
import type { ScheduleCopy, ScheduleStore } from '@/trip/schedule-store'

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

const nightsOf = (stay: Stay) => daysBetween(stay.checkIn, stay.checkOut)

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

const staySummaryOf = (stay: Stay): StaySummary => ({
  base: placeOf(stay.base),
  checkIn: stay.checkIn,
  checkOut: stay.checkOut,
  nights: nightsOf(stay),
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

/**
 * Each Move with the Stays it connects, by date. A Schedule's Moves keep
 * their ids.
 */
const moveDetailsOf = <M extends Move>({
  stays,
  moves,
}: {
  readonly stays: ReadonlyArray<Stay>
  readonly moves: ReadonlyArray<M>
}) =>
  new Map(
    stayBoundariesOf(stays).flatMap(({ date, from, to }) => {
      const move = moves.find((move) => move.date === date)
      if (move === undefined) return []
      const sections = move.sections.map((section) => ({
        ...section,
        from: stationOf(section.from),
        to: stationOf(section.to),
      }))
      const detail = {
        ...Struct.omit(move, ['date', 'sections']),
        from: placeOf(from.base),
        to: placeOf(to.base),
        sections,
        changes: sections.slice(1).map((section) => section.from),
      } satisfies MoveDetail
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
  { verifyClaims }: { readonly verifyClaims: ReadonlyArray<VerifyClaim> },
  attachment: VerifyClaimAttachment,
): Array<VerifyClaimDetail> =>
  verifyClaims
    .filter(
      (claim) => attachmentKey(claim.attachedTo) === attachmentKey(attachment),
    )
    .map(({ id, text }) => ({ id, text }))

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

/** Each Move with its date and the Bases it connects, in travel order. */
const datedMovesOf = (itinerary: Itinerary) =>
  Array.from(moveDetailsOf(itinerary), ([date, move]) => ({ date, ...move }))

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
    durationNotGiven: travelling
      .filter((move) => move.duration === undefined)
      .map(moveSummaryOf),
  }
}

const birthdayOf = ({ stays, birthdayOutline }: Itinerary) => {
  const stay = stayForNight(stays, birthdayDate)
  return {
    ...(stay && { base: placeOf(stay.base) }),
    outline: birthdayOutline,
  }
}

/**
 * Each group of Day trips once, by its first Day trip, in the order the Trip
 * first makes one. A group is optional only when every Day trip in it is. A
 * Day trip without a group is left out.
 */
const groupedDayTrips = (
  dayTrips: ReadonlyArray<DayTrip>,
  groupOf: (dayTrip: DayTrip) => string | undefined,
) => {
  const groups = new Map<string, { first: DayTrip; optional: boolean }>()
  const byDate = [...dayTrips].sort((a, b) => a.date.localeCompare(b.date))
  for (const dayTrip of byDate) {
    const group = groupOf(dayTrip)
    if (group === undefined) continue
    const seen = groups.get(group)
    groups.set(group, {
      first: seen?.first ?? dayTrip,
      optional: (seen?.optional ?? true) && dayTrip.optional,
    })
  }
  return Array.from(groups.values())
}

const dayTripsOf = ({ dayTrips }: Itinerary): Array<DayTripDetail> =>
  groupedDayTrips(dayTrips, (dayTrip) => dayTrip.place).map(
    ({ first, optional }) => ({ place: placeOf(first.place), optional }),
  )

const flightsOf = (moves: ReadonlyArray<DatedMove>) =>
  moves.filter((move) => move.mode === 'flight').map(moveSummaryOf)

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

/** Each point once where consecutive points coincide. */
const withoutRepeats = (path: ReadonlyArray<Coordinates>) =>
  path.filter((point, index) => {
    const previous = path[index - 1]
    return (
      previous?.latitude !== point.latitude ||
      previous.longitude !== point.longitude
    )
  })

/** Each pair of Base and Day trip destination once. */
const mapDayTripsOf = ({ stays, dayTrips }: Itinerary): Array<MapDayTrip> => {
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

/**
 * A rail section's path on the map: along its rail line, or straight between
 * its stations when the rail geometry lacks it.
 */
const railPathOf = (section: RailSectionDetail) => {
  const path = railGeometryOf(railSectionIdsOf(section))
  return path
    ? { path, followsRailLine: true }
    : {
        path: [section.from.coordinates, section.to.coordinates],
        followsRailLine: false,
      }
}

const mapOf = (itinerary: Itinerary): ItineraryMap => {
  const moves = datedMovesOf(itinerary)
  const trainMoves = moves
    .filter((move) => move.mode === 'train')
    .map((move) => ({ move, railPaths: move.sections.map(railPathOf) }))
  return {
    bases: Array.from(new Set(itinerary.stays.map((stay) => stay.base))).map(
      placeOf,
    ),
    trainMoves: trainMoves.map(({ move, railPaths }) => ({
      date: move.date,
      path: withoutRepeats([
        move.from.coordinates,
        ...railPaths.flatMap((railPath) => railPath.path),
        move.to.coordinates,
      ]),
    })),
    flights: flightsOf(moves),
    dayTrips: mapDayTripsOf(itinerary),
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

/**
 * Every rail section the Itineraries ride, once whichever way it's ridden,
 * in the direction first ridden.
 */
const railSectionsOf = (
  itineraries: ReadonlyArray<Itinerary>,
): Array<MapRailSection> => {
  const sections = new Map<string, MapRailSection>()
  for (const move of itineraries.flatMap(datedMovesOf)) {
    for (const section of move.sections) {
      const key = railSectionKey(railSectionIdsOf(section))
      if (sections.has(key)) continue
      const { followsRailLine } = railPathOf(section)
      sections.set(key, { ...section, followsRailLine })
    }
  }
  return Array.from(sections.values())
}

/**
 * What Stays and Days are shown from: an Itinerary's content with its
 * Anchors, or a Schedule's copy of them, whose entities keep their ids.
 */
interface Plan<
  S extends Stay,
  M extends Move,
  T extends DayTrip,
  A extends Anchor,
> {
  readonly stays: ReadonlyArray<S>
  readonly days: ReadonlyArray<Day>
  readonly moves: ReadonlyArray<M>
  readonly dayTrips: ReadonlyArray<T>
  readonly verifyClaims: ReadonlyArray<VerifyClaim>
  readonly anchors: ReadonlyArray<A>
}

/** The Stays and all 15 Days, and the Verify claims about the whole. */
const staysAndDaysOf = <
  S extends Stay,
  M extends Move,
  T extends DayTrip,
  A extends Anchor,
>(
  plan: Plan<S, M, T, A>,
) => {
  const moves = moveDetailsOf(plan)
  return {
    verifyClaims: claimsAttachedTo(plan, { _tag: 'Itinerary' }),
    stays: plan.stays.map((stay) => ({
      ...stay,
      ...staySummaryOf(stay),
      verifyClaims: claimsAttachedTo(plan, {
        _tag: 'Stay',
        checkIn: stay.checkIn,
      }),
    })),
    days: plan.days.map((day) => {
      const dayAnchors = plan.anchors.filter(
        (anchor) => anchor.date === day.date,
      )
      const move = moves.get(day.date)
      const dayTrips = plan.dayTrips
        .filter((dayTrip) => dayTrip.date === day.date)
        .map((dayTrip) => ({
          ...Struct.omit(dayTrip, ['date', 'place']),
          place: placeOf(dayTrip.place),
        }))
      return {
        ...day,
        anchors: dayAnchors,
        ...(move && { move }),
        dayTrips,
        verifyClaims: claimsAttachedTo(plan, {
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

/**
 * A complete copy of an Itinerary for a new Schedule, with a fresh id for
 * each Stay, Move, Day trip, Verify claim and Anchor.
 */
const copyOf = (itinerary: Itinerary): ScheduleCopy => {
  const withFreshId = <A extends object>(entity: A) => ({
    ...entity,
    id: crypto.randomUUID(),
  })
  return {
    stays: itinerary.stays.map(withFreshId),
    days: itinerary.days,
    moves: itinerary.moves.map(withFreshId),
    dayTrips: itinerary.dayTrips.map(withFreshId),
    verifyClaims: itinerary.verifyClaims.map(withFreshId),
    anchors: anchorsOf(itinerary).map(withFreshId),
  }
}

/**
 * Whether the Itinerary a Schedule came from has had a Revision since it was
 * chosen, by comparing content versions under the same Option number.
 */
const sourceItineraryOf = (
  schedule: ScheduleRecord,
  itineraries: ReadonlyMap<number, Itinerary>,
): SourceItineraryStatus => {
  const source = itineraries.get(schedule.sourceOptionNumber)
  if (source === undefined) return 'unavailable'
  return source.contentVersion === schedule.sourceContentVersion
    ? 'unchanged'
    : 'revised'
}

/**
 * A Schedule as its page shows it, from its own record and copy alone, and
 * the current content version of the Itinerary it came from.
 */
const scheduleDetailOf =
  (itineraries: ReadonlyMap<number, Itinerary>) =>
  ({
    schedule,
    copy,
  }: {
    readonly schedule: ScheduleRecord
    readonly copy: ScheduleCopy
  }): ScheduleDetail => ({
    ...schedule,
    sourceItinerary: sourceItineraryOf(schedule, itineraries),
    ...staysAndDaysOf(copy),
  })

/**
 * The current Schedule, if it is the one a write names (none when it names
 * null); ScheduleChanged otherwise. Every Schedule write checks this first,
 * so a write from an out-of-date screen, or to an archived Schedule, writes
 * nothing.
 */
const requireCurrent = Effect.fnUntraced(function* (
  store: ScheduleStore,
  named: ScheduleId | null,
) {
  const current = yield* store.currentRecord
  const currentId = Option.getOrNull(Option.map(current, ({ id }) => id))
  if (currentId !== named) return yield* new ScheduleChanged()
  return current
})

/**
 * Archives the current Schedule that choosing or restoring replaces, at a
 * moment given as an ISO 8601 UTC string; nothing when none exists yet.
 */
const archiveReplaced = Effect.fnUntraced(function* (
  store: ScheduleStore,
  replacing: ScheduleId | null,
  archivedAt: string,
) {
  const current = yield* requireCurrent(store, replacing)
  if (Option.isSome(current)) {
    yield* store.archive(current.value.id, archivedAt)
  }
})

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

/**
 * The application seam: all Trip behaviour, independent of HTTP and React.
 *
 * Its storage operations take the SQL client from their caller rather than
 * from its layer: only the Durable Object has one (and the tests, over Node's
 * SQLite), so the Worker can't run them by mistake.
 */
export class Trip extends Context.Service<
  Trip,
  {
    /** Home's state at the current moment of the Clock. */
    readonly home: Effect.Effect<HomeState>
    /** Every Itinerary with its comparison rows. */
    readonly itineraries: Effect.Effect<ReadonlyArray<ItineraryComparison>>
    /** Every Itinerary's Moves and Bases, overlaid on one map. */
    readonly comparisonMap: Effect.Effect<ComparisonMap>
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
    /**
     * Every rail section the Itineraries ride, once whichever way it's
     * ridden, and whether the map follows its rail line. Only the rail
     * geometry build and the tests call this.
     */
    readonly railSections: Effect.Effect<ReadonlyArray<MapRailSection>>
    /**
     * Copies an Itinerary into a fresh current Schedule, archiving the one it
     * replaces, as one transaction that also records the operation id with
     * its result. Repeating the operation id returns that result and writes
     * nothing.
     */
    choose(
      input: ChooseItinerary,
    ): Effect.Effect<
      ScheduleChosen,
      ItineraryNotFound | ScheduleChanged,
      SqlClient.SqlClient
    >
    /**
     * Makes an archived Schedule current again, archiving the one it
     * replaces, as one transaction that also records the operation id with
     * its result. Repeating the operation id returns that result and writes
     * nothing.
     */
    restore(
      input: RestoreSchedule,
    ): Effect.Effect<
      ScheduleRestored,
      ScheduleNotFound | ScheduleChanged,
      SqlClient.SqlClient
    >
    /** One Schedule, current or archived. */
    schedule(
      scheduleId: ScheduleId,
    ): Effect.Effect<ScheduleDetail, ScheduleNotFound, SqlClient.SqlClient>
    /** The current Schedule, if Phillip has chosen one. */
    readonly currentSchedule: Effect.Effect<
      Option.Option<ScheduleDetail>,
      never,
      SqlClient.SqlClient
    >
    /** The current Schedule's summary, if Phillip has chosen one. */
    readonly scheduleSummary: Effect.Effect<
      Option.Option<ScheduleSummary>,
      never,
      SqlClient.SqlClient
    >
    /** Every archived Schedule, the most recently archived first. */
    readonly archivedSchedules: Effect.Effect<
      ReadonlyArray<ArchivedScheduleSummary>,
      never,
      SqlClient.SqlClient
    >
  }
>()('japan-trip/trip/Trip') {
  static readonly layer = Layer.effect(
    Trip,
    Effect.gen(function* () {
      const { all } = yield* Itineraries
      const summaries = all.map(summaryOf)
      const comparisons = all.map(comparisonOf)
      const railSections = railSectionsOf(all)
      const byOptionNumber = new Map(
        all.map((itinerary) => [itinerary.optionNumber, itinerary]),
      )
      // Content never changes while the Worker runs, so derive it once.
      const details = new Map(
        all.map((itinerary) => [itinerary.optionNumber, detailOf(itinerary)]),
      )
      const comparisonMap = comparisonMapOf(Array.from(details.values()))
      const scheduleDetail = scheduleDetailOf(byOptionNumber)

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

      const choose = Effect.fn('Trip.choose')(
        function* ({ operationId, optionNumber, replacing }: ChooseItinerary) {
          const store = yield* scheduleStore
          return yield* store.transaction(
            Effect.gen(function* () {
              const recorded =
                yield* store.recordedResult(ScheduleChosen)(operationId)
              if (Option.isSome(recorded)) return recorded.value.result
              const itinerary = yield* find(byOptionNumber, optionNumber)
              const now = DateTime.formatIso(yield* DateTime.now)
              yield* archiveReplaced(store, replacing, now)
              const scheduleId = crypto.randomUUID() as ScheduleId
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
              // Restoring the current Schedule archives it and makes it
              // current again, leaving it as it was.
              const now = DateTime.formatIso(yield* DateTime.now)
              yield* archiveReplaced(store, replacing, now)
              yield* store.makeCurrent(scheduleId)
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

      const currentSchedule = Effect.gen(function* () {
        const store = yield* scheduleStore
        const current = yield* store.transaction(store.current)
        return Option.map(current, scheduleDetail)
      }).pipe(
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
        Effect.withSpan('Trip.currentSchedule'),
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

      const archivedSchedules = Effect.flatMap(
        scheduleStore,
        (store) => store.archived,
      ).pipe(
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
        Effect.withSpan('Trip.archivedSchedules'),
      )

      return Trip.of({
        home: Effect.map(DateTime.now, (now) => ({
          countdown: countdownAt(now),
          itineraries: summaries,
        })),
        itineraries: Effect.succeed(comparisons),
        comparisonMap: Effect.succeed(comparisonMap),
        itinerary: (optionNumber) => find(details, optionNumber),
        tripRuleBreaks: (optionNumber) =>
          find(byOptionNumber, optionNumber).pipe(Effect.map(tripRuleBreaksOf)),
        railSections: Effect.succeed(railSections),
        choose,
        restore,
        schedule,
        currentSchedule,
        scheduleSummary,
        archivedSchedules,
      })
    }),
  )
}
