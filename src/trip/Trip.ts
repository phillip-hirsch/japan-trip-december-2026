// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import {
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Predicate,
  Struct,
} from 'effect'
import type { SqlClient } from 'effect/sql'

import {
  birthdayDate,
  isTripDate,
  shigeharuDate,
  tripDates,
  tripEndDate,
  tripStartDate,
  tripTimeZone,
} from '@/trip/calendar'
import {
  ActivityAdded,
  ActivityNotFound,
  ActivityTitleInvalid,
  Anchor,
  ChecklistItem,
  ChecklistItemNotFound,
  ChecklistTextInvalid,
  DayNotFound,
  HomeState,
  Hotel,
  IsoDate,
  ItineraryNotFound,
  NoteTooLong,
  OwnChecklistItemAdded,
  ScheduleAnchor,
  ScheduleChanged,
  ScheduleChosen,
  ScheduleId,
  ScheduleNotFound,
  ScheduleRestored,
  StayNotFound,
  TripRuleBreak,
  VerifyClaimAttachment,
} from '@/trip/domain'
import type {
  Activity,
  AddActivity,
  AddOwnChecklistItem,
  ArchivedScheduleSummary,
  BaseNights,
  Checklist,
  ChooseItinerary,
  ComparisonMap,
  Coordinates,
  Day,
  DayPage,
  DayTrip,
  DayTripDetail,
  EditActivity,
  Itinerary,
  ItineraryComparison,
  ItineraryDetail,
  ItineraryMap,
  ItinerarySummary,
  MapDayTrip,
  MapRailSection,
  Move,
  MoveActivity,
  MoveDetail,
  MovesComparison,
  MoveSummary,
  Place,
  RailSectionDetail,
  RemoveActivity,
  RemoveOwnChecklistItem,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleRecord,
  ScheduleSummary,
  SourceItineraryStatus,
  Stay,
  StaySummary,
  Station,
  TickChecklistItem,
  TickOwnChecklistItem,
  TimeOfDay,
  VerifyClaim,
  VerifyClaimDetail,
  WriteDayNote,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { reminderDateOf } from '@/trip/checklist-items'
import {
  activityTitleMaxLength,
  checklistTextMaxLength,
  noteMaxLength,
} from '@/trip/limits'
import { places, visitedPlaceIds } from '@/trip/places'
import type { PlaceId } from '@/trip/places'
import { railSectionIdsOf, railSectionKey, stations } from '@/trip/rail'
import type { StationId } from '@/trip/rail'
import { railGeometryAttribution, railGeometryOf } from '@/trip/rail-geometry'
import { scheduleStore } from '@/trip/schedule-store'
import type {
  OwnChecklistItem,
  ScheduleCopy,
  ScheduleStore,
} from '@/trip/schedule-store'

/** The calendar date in Tokyo at a moment. */
const tokyoDateOf = (now: DateTime.DateTime) =>
  IsoDate.make(
    DateTime.formatIsoDate(
      DateTime.removeTime(DateTime.setZoneNamedUnsafe(now, tripTimeZone)),
    ),
  )

const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round(
    Duration.toDays(
      DateTime.distance(DateTime.makeUnsafe(from), DateTime.makeUnsafe(to)),
    ),
  )

const addDays = (date: IsoDate, days: number) =>
  IsoDate.make(
    DateTime.formatIsoDate(DateTime.add(DateTime.makeUnsafe(date), { days })),
  )

/** The same date a month earlier: November 9 for December 9. */
const monthBefore = (date: IsoDate) =>
  IsoDate.make(
    DateTime.formatIsoDate(
      DateTime.subtract(DateTime.makeUnsafe(date), { months: 1 }),
    ),
  )

const nightsOf = (stay: Stay) => daysBetween(stay.checkIn, stay.checkOut)

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
const stayForNight = <S extends Pick<Stay, 'checkIn' | 'checkOut'>>(
  stays: ReadonlyArray<S>,
  date: IsoDate,
) => stays.find((stay) => stay.checkIn <= date && date < stay.checkOut)

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
  Anchor.cases.Arrival.make({ date: tripStartDate }),
  ...(shigeharuVisit
    ? [
        Anchor.cases.ShigeharuVisit.make({
          ...shigeharuVisit,
          tentative: true,
          thursdayBackup: hasThursdayBackup(stays),
        }),
      ]
    : []),
  Anchor.cases.Birthday.make({ date: birthdayDate }),
  Anchor.cases.Departure.make({ date: tripEndDate }),
]

/** One key per place a Verify claim can attach to, for matching. */
const attachmentKey = (attachedTo: VerifyClaimAttachment) =>
  VerifyClaimAttachment.match(attachedTo, {
    Day: (attachedTo) => `Day ${attachedTo.date}`,
    Stay: (attachedTo) => `Stay ${attachedTo.checkIn}`,
    Itinerary: () => 'Itinerary',
  })

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
 * Anchors, or a Schedule's copy of them, whose entities keep their ids and
 * whose Days carry Phillip's Day notes.
 */
interface Plan<
  S extends Stay,
  D extends Day,
  M extends Move,
  T extends DayTrip,
  A extends Anchor,
> {
  readonly stays: ReadonlyArray<S>
  readonly days: ReadonlyArray<D>
  readonly moves: ReadonlyArray<M>
  readonly dayTrips: ReadonlyArray<T>
  readonly verifyClaims: ReadonlyArray<VerifyClaim>
  readonly anchors: ReadonlyArray<A>
}

/** The Stays and all 15 Days, and the Verify claims about the whole. */
const staysAndDaysOf = <
  S extends Stay,
  D extends Day,
  M extends Move,
  T extends DayTrip,
  A extends Anchor,
>(
  plan: Plan<S, D, M, T, A>,
) => {
  const moves = moveDetailsOf(plan)

  return {
    verifyClaims: claimsAttachedTo(
      plan,
      VerifyClaimAttachment.cases.Itinerary.make({}),
    ),
    stays: plan.stays.map((stay) => ({
      ...stay,
      ...staySummaryOf(stay),
      verifyClaims: claimsAttachedTo(
        plan,
        VerifyClaimAttachment.cases.Stay.make({ checkIn: stay.checkIn }),
      ),
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
        verifyClaims: claimsAttachedTo(
          plan,
          VerifyClaimAttachment.cases.Day.make({ date: day.date }),
        ),
        freeDay:
          day.description === undefined &&
          move === undefined &&
          dayTrips.length === 0 &&
          !dayAnchors.some(
            (anchor) =>
              Predicate.isTagged('Arrival')(anchor) ||
              Predicate.isTagged('Departure')(anchor),
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
    days: itinerary.days.map((day) => ({ ...day, activities: [] })),
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
 * A Day of a Schedule as its page shows it: the Day, tonight's hotel (the
 * Stay covering the night, except on December 20, when Phillip flies home)
 * and the next Move (the first dated that Day or later).
 */
const dayPageOf = (schedule: ScheduleDetail, date: IsoDate) =>
  Option.map(
    Option.fromUndefinedOr(schedule.days.find((day) => day.date === date)),
    (day): DayPage => {
      const tonight =
        date === tripEndDate ? undefined : stayForNight(schedule.stays, date)

      const nextMove = schedule.days
        .filter((later) => later.date >= date)
        .flatMap((later) =>
          later.move ? [{ date: later.date, ...later.move }] : [],
        )
        .at(0)

      return {
        scheduleId: schedule.id,
        day,
        ...(tonight && {
          tonight: {
            id: tonight.id,
            ...Struct.pick(tonight, ['base', 'checkIn', 'checkOut', 'nights']),
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        }),
        ...(nextMove && { nextMove }),
      }
    },
  )

/**
 * Home's state at a moment: before the Trip, the countdown and the Schedule;
 * during it, Today, the Day page of the Tokyo date; after it, the Schedule
 * as a record. The Itineraries stand in for a Schedule not yet chosen.
 */
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

/** NoteTooLong past the longest note the Trip service accepts. */
const requireNoteLength = (note: string) =>
  note.length > noteMaxLength
    ? Effect.fail(new NoteTooLong({ maxLength: noteMaxLength }))
    : Effect.void

/**
 * Where an item derived from a Schedule falls in Trip order on its date: a
 * Move first, then the Stay it reaches with that Stay's Verify claims, then
 * the Anchors and the Day's Verify claims. Verify claims about the whole
 * Schedule come before everything, on the first Day.
 */
const tripOrderOnDate = {
  wholeClaim: 0,
  move: 1,
  stay: 2,
  stayClaim: 3,
  anchor: 4,
  dayClaim: 5,
}

interface DerivedEntry {
  readonly date: IsoDate
  readonly order: number
  readonly item: ChecklistItem
}

/**
 * The Checklist items a Schedule's copy derives, in Trip order, each ticked
 * when its id, that of what it refers to, is among the ticks. Local Moves
 * and the Arrival and Departure Anchors derive none.
 */
const derivedChecklistOf = (
  copy: ScheduleCopy,
  ticks: ReadonlySet<string>,
): Array<ChecklistItem> => {
  const tickOf = (id: string) => ({ id, ticked: ticks.has(id) })

  const stays = copy.stays.map((stay): DerivedEntry => ({
    date: stay.checkIn,
    order: tripOrderOnDate.stay,
    item: ChecklistItem.cases.BookHotel.make({
      ...tickOf(stay.id),
      stay: staySummaryOf(stay),
    }),
  }))

  const moves = Array.from(moveDetailsOf(copy)).flatMap(
    ([date, move]): Array<DerivedEntry> => {
      const fields = {
        ...tickOf(move.id),
        move: { date, ...Struct.pick(move, ['from', 'to']) },
      }

      const at = { date, order: tripOrderOnDate.move }

      return Match.value(move.mode).pipe(
        Match.withReturnType<Array<DerivedEntry>>(),
        Match.when('train', () => [
          {
            ...at,
            item: ChecklistItem.cases.ReserveSeats.make({
              ...fields,
              reminderDate: monthBefore(date),
              verify: 'reminder-date',
            }),
          },
        ]),
        Match.when('flight', () => [
          {
            ...at,
            item: ChecklistItem.cases.BookFlight.make({
              ...fields,
              verify: 'when-booking-opens',
            }),
          },
        ]),
        Match.when('local', () => []),
        Match.exhaustive,
      )
    },
  )

  const anchors = copy.anchors.flatMap((anchor): Array<DerivedEntry> => {
    const at = { date: anchor.date, order: tripOrderOnDate.anchor }
    const fields = { ...tickOf(anchor.id), date: anchor.date }

    return ScheduleAnchor.match<Array<DerivedEntry>>(anchor, {
      Arrival: () => [],
      ShigeharuVisit: () => [
        { ...at, item: ChecklistItem.cases.ConfirmShigeharu.make(fields) },
      ],
      Birthday: () => [
        { ...at, item: ChecklistItem.cases.ReserveBirthdayDinner.make(fields) },
      ],
      Departure: () => [],
    })
  })

  const claims = copy.verifyClaims.map((claim): DerivedEntry => ({
    ...VerifyClaimAttachment.match(claim.attachedTo, {
      Day: ({ date }) => ({ date, order: tripOrderOnDate.dayClaim }),
      Stay: ({ checkIn }) => ({
        date: checkIn,
        order: tripOrderOnDate.stayClaim,
      }),
      Itinerary: () => ({
        date: tripStartDate,
        order: tripOrderOnDate.wholeClaim,
      }),
    }),
    item: ChecklistItem.cases.VerifyClaim.make({
      ...tickOf(claim.id),
      ...Struct.pick(claim, ['text', 'attachedTo']),
    }),
  }))

  // Sorting is stable, so entries on the same date and order keep the
  // Schedule's own order.
  return [...moves, ...stays, ...anchors, ...claims]
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    .map(({ item }) => item)
}

/**
 * Where an item falls on the Checklist before its reminder date counts:
 * derived items without one, dated items, then own items without one.
 */
const checklistGroups = { undatedDerived: 0, dated: 1, undatedOwn: 2 }

const checklistGroupOf = (item: ChecklistItem) =>
  reminderDateOf(item) !== undefined
    ? checklistGroups.dated
    : ChecklistItem.guards.Own(item)
      ? checklistGroups.undatedOwn
      : checklistGroups.undatedDerived

/**
 * The derived items, in Trip order, with Phillip's own, in the order added,
 * the next thing to do on top: items without a reminder date first, then
 * the rest by reminder date (own after derived on the same date), and last
 * his own without one.
 */
const checklistOf = (
  derived: ReadonlyArray<ChecklistItem>,
  own: ReadonlyArray<OwnChecklistItem>,
): Array<ChecklistItem> =>
  [
    ...derived,
    ...own.map(({ reminderDate, ...item }) =>
      ChecklistItem.cases.Own.make({
        ...item,
        ...(reminderDate !== null && { reminderDate }),
      }),
    ),
  ].sort(
    (a, b) =>
      checklistGroupOf(a) - checklistGroupOf(b) ||
      (reminderDateOf(a) ?? '').localeCompare(reminderDateOf(b) ?? ''),
  )

/** Text trimmed; the failure made for the cap when that is blank or too long. */
const requireText = <E>(
  text: string,
  maxLength: number,
  invalid: (maxLength: number) => E,
) => {
  const trimmed = text.trim()

  return trimmed === '' || trimmed.length > maxLength
    ? Effect.fail(invalid(maxLength))
    : Effect.succeed(trimmed)
}

/**
 * An own Checklist item's text, trimmed; ChecklistTextInvalid when that is
 * blank or too long.
 */
const requireChecklistText = (text: string) =>
  requireText(
    text,
    checklistTextMaxLength,
    (maxLength) => new ChecklistTextInvalid({ maxLength }),
  )

/**
 * An Activity's title, trimmed; ActivityTitleInvalid when that is blank or
 * too long.
 */
const requireActivityTitle = (title: string) =>
  requireText(
    title,
    activityTitleMaxLength,
    (maxLength) => new ActivityTitleInvalid({ maxLength }),
  )

/**
 * An Activity's time: the time of day in Tokyo on its Day's date, as a zoned
 * date-time. Tokyo keeps UTC+9 all year, so every time of day exists once.
 */
const activityTimeOf = (date: IsoDate, time: TimeOfDay) =>
  DateTime.formatIsoZoned(
    DateTime.makeZonedUnsafe(`${date}T${time}:00`, {
      timeZone: tripTimeZone,
      adjustForTimeZone: true,
    }),
  )

/**
 * Where a new Activity goes among a Day's: a timed one before the first with
 * a later time, any other last. The times on one Day share its date and
 * Tokyo's offset, so their strings sort in time order.
 */
const insertionIndexOf = (
  activities: ReadonlyArray<Activity>,
  time: string | undefined,
) => {
  const later =
    time === undefined
      ? -1
      : activities.findIndex(
          (activity) => activity.time !== undefined && activity.time > time,
        )

  return later === -1 ? activities.length : later
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

  if (first === undefined || last === undefined)
    return [TripRuleBreak.cases.NoStays.make({})]

  const breaks: Array<TripRuleBreak> = []

  if (first.checkIn !== tripStartDate || last.checkOut !== tripEndDate) {
    breaks.push(
      TripRuleBreak.cases.NotTheTripDates.make({
        checkIn: first.checkIn,
        checkOut: last.checkOut,
      }),
    )
  }

  for (const stay of stays) {
    if (stay.checkOut <= stay.checkIn) {
      breaks.push(
        TripRuleBreak.cases.StayWithoutNights.make({ checkIn: stay.checkIn }),
      )
    }
  }

  stays.slice(1).forEach((next, index) => {
    const previous = stays[index]

    if (previous === undefined) return

    if (previous.checkOut < next.checkIn) {
      breaks.push(
        TripRuleBreak.cases.Gap.make({
          from: previous.checkOut,
          to: next.checkIn,
        }),
      )
    } else if (next.checkIn < previous.checkOut) {
      breaks.push(
        TripRuleBreak.cases.Overlap.make({
          from: next.checkIn,
          to: previous.checkOut,
        }),
      )
    }
  })
  const boundaryDates = new Set(stayBoundariesOf(stays).map(({ date }) => date))
  const moveDates = new Set(moves.map((move) => move.date))

  for (const date of moveDates) {
    if (!boundaryDates.has(date)) {
      breaks.push(TripRuleBreak.cases.MoveWithoutStayBoundary.make({ date }))
    }
  }

  for (const date of boundaryDates) {
    if (!moveDates.has(date)) {
      breaks.push(TripRuleBreak.cases.StayBoundaryWithoutMove.make({ date }))
    }
  }

  const dates = days.map((day) => day.date)

  if (dates.join() !== tripDates.join()) {
    breaks.push(TripRuleBreak.cases.NotTheTripDays.make({ dates }))
  }

  const shigeharuEve = stayForNight(stays, thursdayBeforeShigeharu)

  if (shigeharuEve?.base !== 'kyoto') {
    breaks.push(
      TripRuleBreak.cases.NotWakingUpInKyoto.make({
        ...(shigeharuEve && { base: shigeharuEve.base }),
      }),
    )
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

  if (moveDates.has(birthdayDate)) {
    breaks.push(TripRuleBreak.cases.MoveOnBirthday.make({}))
  }

  const attachments = new Set(
    [
      VerifyClaimAttachment.cases.Itinerary.make({}),
      ...days.map(({ date }) => VerifyClaimAttachment.cases.Day.make({ date })),
      ...stays.map(({ checkIn }) =>
        VerifyClaimAttachment.cases.Stay.make({ checkIn }),
      ),
    ].map(attachmentKey),
  )

  for (const { id, attachedTo } of verifyClaims) {
    if (!attachments.has(attachmentKey(attachedTo))) {
      breaks.push(TripRuleBreak.cases.UnattachedVerifyClaim.make({ id }))
    }
  }

  if (last.base !== 'tokyo') {
    breaks.push(TripRuleBreak.cases.EndsOutsideTokyo.make({ base: last.base }))
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
    /**
     * Home's state at the current moment of the Clock, in Tokyo: before the
     * Trip, during it (00:00 on December 6 to 23:59:59.999 on December 20,
     * inclusive) or after it.
     */
    readonly home: Effect.Effect<HomeState, never, SqlClient.SqlClient>
    /**
     * One Day of the current Schedule as its page shows it; none before a
     * Schedule is chosen. DayNotFound for a date outside the Trip.
     */
    day(
      date: IsoDate,
    ): Effect.Effect<Option.Option<DayPage>, DayNotFound, SqlClient.SqlClient>
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
    /**
     * The current Schedule, if Phillip has chosen one, every archived
     * Schedule, the most recently archived first, and the Trip note, if he
     * has written one, read as one transaction so they never come from two
     * moments.
     */
    readonly schedules: Effect.Effect<
      {
        readonly current: Option.Option<ScheduleDetail>
        readonly archived: ReadonlyArray<ArchivedScheduleSummary>
        readonly tripNote?: string
      },
      never,
      SqlClient.SqlClient
    >
    /** The current Schedule's summary, if Phillip has chosen one. */
    readonly scheduleSummary: Effect.Effect<
      Option.Option<ScheduleSummary>,
      never,
      SqlClient.SqlClient
    >
    /**
     * Writes the Day note on a Day of the Schedule named, as a whole value,
     * so the last write wins. An empty note removes it. ScheduleChanged when
     * the Schedule named isn't current, archived ones included; DayNotFound
     * when it has no Day on the date; NoteTooLong past 10,000 characters.
     * A refused write writes nothing.
     */
    writeDayNote(
      input: WriteDayNote,
    ): Effect.Effect<
      void,
      ScheduleChanged | DayNotFound | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Writes the Stay note on a Stay of the Schedule named, as a whole value,
     * so the last write wins. An empty note removes it. ScheduleChanged when
     * the Schedule named isn't current, archived ones included; StayNotFound
     * when it has no Stay with the id; NoteTooLong past 10,000 characters. A
     * refused write writes nothing.
     */
    writeStayNote(
      input: WriteStayNote,
    ): Effect.Effect<
      void,
      ScheduleChanged | StayNotFound | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Writes the Trip note as a whole value, so the last write wins. An empty
     * note removes it. It belongs to the Trip, so choosing again or restoring
     * leaves it as it is. NoteTooLong past 10,000 characters, writing
     * nothing.
     */
    writeTripNote(
      input: WriteTripNote,
    ): Effect.Effect<void, NoteTooLong, SqlClient.SqlClient>
    /**
     * The Checklist, derived from the current Schedule as it is now, with
     * Phillip's own items, read as one transaction. Before a Schedule is
     * chosen, only his own items.
     */
    readonly checklist: Effect.Effect<Checklist, never, SqlClient.SqlClient>
    /**
     * Sets the tick on an item derived from the Schedule named, to true or
     * false; setting it again changes nothing. ScheduleChanged when the
     * Schedule named isn't current, archived ones included;
     * ChecklistItemNotFound when nothing in it derives an item with the id.
     * A refused write writes nothing.
     */
    tickChecklistItem(
      input: TickChecklistItem,
    ): Effect.Effect<
      void,
      ScheduleChanged | ChecklistItemNotFound,
      SqlClient.SqlClient
    >
    /**
     * Adds one of Phillip's own Checklist items, its text trimmed, as one
     * transaction that also records the operation id with its result.
     * Repeating the operation id returns that result and writes nothing.
     * ChecklistTextInvalid for blank text or text past 500 characters.
     */
    addOwnChecklistItem(
      input: AddOwnChecklistItem,
    ): Effect.Effect<
      OwnChecklistItemAdded,
      ChecklistTextInvalid,
      SqlClient.SqlClient
    >
    /**
     * Sets the tick on one of Phillip's own Checklist items, to true or
     * false. ChecklistItemNotFound when none has the id, such as one removed.
     */
    tickOwnChecklistItem(
      input: TickOwnChecklistItem,
    ): Effect.Effect<void, ChecklistItemNotFound, SqlClient.SqlClient>
    /**
     * Removes one of Phillip's own Checklist items; removing one already gone
     * changes nothing, so a retry succeeds.
     */
    removeOwnChecklistItem(
      input: RemoveOwnChecklistItem,
    ): Effect.Effect<void, never, SqlClient.SqlClient>
    /**
     * Adds an Activity on a Day of the Schedule named, its title trimmed, as
     * one transaction that also records the operation id with its result.
     * Repeating the operation id returns that result and writes nothing. A
     * timed Activity goes before the first with a later time; any other
     * goes last. ScheduleChanged when the Schedule named isn't current,
     * archived ones included; DayNotFound when it has no Day on the date;
     * ActivityTitleInvalid for a blank title or one past 200 characters;
     * NoteTooLong past 10,000 characters.
     */
    addActivity(
      input: AddActivity,
    ): Effect.Effect<
      ActivityAdded,
      ScheduleChanged | DayNotFound | ActivityTitleInvalid | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Writes the fields an edit carries on an Activity of the Schedule
     * named, so the last write wins for each field; its time stays on its
     * Day's date and its place in the order stays. ScheduleChanged when the
     * Schedule named isn't current; ActivityNotFound when it has no Activity
     * with the id; ActivityTitleInvalid and NoteTooLong as when adding. A
     * refused write writes nothing.
     */
    editActivity(
      input: EditActivity,
    ): Effect.Effect<
      void,
      ScheduleChanged | ActivityNotFound | ActivityTitleInvalid | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Removes an Activity of the Schedule named. ScheduleChanged when the
     * Schedule named isn't current; ActivityNotFound when it has no Activity
     * with the id, such as one already removed.
     */
    removeActivity(
      input: RemoveActivity,
    ): Effect.Effect<
      void,
      ScheduleChanged | ActivityNotFound,
      SqlClient.SqlClient
    >
    /**
     * Moves an Activity of the Schedule named to just before another on the
     * same Day, or after the rest. ScheduleChanged when the Schedule named
     * isn't current; ActivityNotFound when it has no Activity with either
     * id on that Day, so an Activity never moves to another Day.
     */
    moveActivity(
      input: MoveActivity,
    ): Effect.Effect<
      void,
      ScheduleChanged | ActivityNotFound,
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

      /** The current Schedule with its copy, as its page shows it. */
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

      const writeDayNote = Effect.fn('Trip.writeDayNote')(
        function* ({ scheduleId, date, note }: WriteDayNote) {
          yield* requireNoteLength(note)
          const store = yield* scheduleStore
          yield* store.transaction(
            Effect.gen(function* () {
              yield* requireCurrent(store, scheduleId)

              if (!(yield* store.hasDay(scheduleId, date))) {
                return yield* new DayNotFound({ date })
              }

              yield* store.writeDayNote(scheduleId, date, note)
            }),
          )
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

      const writeStayNote = Effect.fn('Trip.writeStayNote')(
        function* ({ scheduleId, stayId, note }: WriteStayNote) {
          yield* requireNoteLength(note)
          const store = yield* scheduleStore
          yield* store.transaction(
            Effect.gen(function* () {
              yield* requireCurrent(store, scheduleId)

              if (!(yield* store.hasStay(scheduleId, stayId))) {
                return yield* new StayNotFound({ stayId })
              }

              yield* store.writeStayNote(scheduleId, stayId, note)
            }),
          )
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

      const writeTripNote = Effect.fn('Trip.writeTripNote')(
        function* ({ note }: WriteTripNote) {
          yield* requireNoteLength(note)
          const store = yield* scheduleStore
          yield* store.writeTripNote(note)
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

      const checklist = Effect.gen(function* () {
        const store = yield* scheduleStore

        return yield* store.transaction(
          Effect.gen(function* () {
            const current = yield* store.current

            const derived = Option.isSome(current)
              ? derivedChecklistOf(
                  current.value.copy,
                  yield* store.ticks(current.value.schedule.id),
                )
              : []

            return {
              scheduleId: Option.getOrNull(
                Option.map(current, ({ schedule }) => schedule.id),
              ),
              items: checklistOf(derived, yield* store.ownItems),
            }
          }),
        )
      }).pipe(
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
        Effect.withSpan('Trip.checklist'),
      )

      const tickChecklistItem = Effect.fn('Trip.tickChecklistItem')(
        function* ({ scheduleId, itemId, ticked }: TickChecklistItem) {
          const store = yield* scheduleStore
          yield* store.transaction(
            Effect.gen(function* () {
              yield* requireCurrent(store, scheduleId)
              const found = yield* store.scheduleById(scheduleId)

              const derives = Option.exists(found, ({ copy }) =>
                derivedChecklistOf(copy, new Set()).some(
                  (item) => item.id === itemId,
                ),
              )

              if (!derives) return yield* new ChecklistItemNotFound({ itemId })
              yield* store.writeTick(scheduleId, itemId, ticked)
            }),
          )
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

      const addOwnChecklistItem = Effect.fn('Trip.addOwnChecklistItem')(
        function* ({ operationId, text, reminderDate }: AddOwnChecklistItem) {
          const trimmed = yield* requireChecklistText(text)
          const store = yield* scheduleStore

          return yield* store.transaction(
            Effect.gen(function* () {
              const recorded = yield* store.recordedResult(
                OwnChecklistItemAdded,
              )(operationId)

              if (Option.isSome(recorded)) return recorded.value.result
              const added = { itemId: crypto.randomUUID() }
              yield* store.addOwnItem(
                added.itemId,
                trimmed,
                reminderDate ?? null,
              )
              yield* store.recordResult(OwnChecklistItemAdded)({
                id: operationId,
                result: added,
              })

              return added
            }),
          )
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

      const tickOwnChecklistItem = Effect.fn('Trip.tickOwnChecklistItem')(
        function* ({ itemId, ticked }: TickOwnChecklistItem) {
          const store = yield* scheduleStore

          if (!(yield* store.writeOwnTick(itemId, ticked))) {
            return yield* new ChecklistItemNotFound({ itemId })
          }
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

      const removeOwnChecklistItem = Effect.fn('Trip.removeOwnChecklistItem')(
        function* ({ itemId }: RemoveOwnChecklistItem) {
          const store = yield* scheduleStore
          yield* store.removeOwnItem(itemId)
        },
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      )

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
              ids.splice(
                insertionIndexOf(activities, activity.time),
                0,
                activity.id,
              )
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

      /**
       * The Day of the current Schedule's Activity named; ScheduleChanged or
       * ActivityNotFound otherwise.
       */
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
        function* ({
          scheduleId,
          activityId,
          title,
          time,
          note,
        }: EditActivity) {
          const trimmed =
            title === undefined ? undefined : yield* requireActivityTitle(title)

          if (note !== undefined) yield* requireNoteLength(note)
          const store = yield* scheduleStore
          yield* store.transaction(
            Effect.gen(function* () {
              const date = yield* requireActivityDay(
                store,
                scheduleId,
                activityId,
              )

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
              const date = yield* requireActivityDay(
                store,
                scheduleId,
                activityId,
              )

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

      return Trip.of({
        home,
        day,
        itineraries: Effect.succeed(comparisons),
        comparisonMap: Effect.succeed(comparisonMap),
        itinerary: (optionNumber) => find(details, optionNumber),
        tripRuleBreaks: (optionNumber) =>
          find(byOptionNumber, optionNumber).pipe(Effect.map(tripRuleBreaksOf)),
        railSections: Effect.succeed(railSections),
        choose,
        restore,
        schedule,
        schedules,
        scheduleSummary,
        writeDayNote,
        writeStayNote,
        writeTripNote,
        checklist,
        tickChecklistItem,
        addOwnChecklistItem,
        tickOwnChecklistItem,
        removeOwnChecklistItem,
        addActivity,
        editActivity,
        removeActivity,
        moveActivity,
      })
    }),
  )
}
