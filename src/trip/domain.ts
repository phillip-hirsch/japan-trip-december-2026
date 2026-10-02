// The Trip's domain types, named as in CONTEXT.md. The schemas run on the
// server only; the browser imports these types with `import type`.
import { DateTime, Option, Schema, Struct } from 'effect'

import { displayStrings } from '@/fonts/display-strings'
import { placeIds } from '@/trip/places'
import { railLineIds, stationIds } from '@/trip/rail'

/**
 * A calendar date in Tokyo time, as YYYY-MM-DD. The check round-trips the
 * date, because an impossible one such as 2026-02-30 otherwise normalises
 * silently to another date.
 */
export const IsoDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((date: string) =>
    Option.exists(
      DateTime.make(date),
      (parsed) => DateTime.formatIsoDate(parsed) === date,
    ),
  ),
).pipe(Schema.brand('IsoDate'))
export type IsoDate = typeof IsoDate.Type

/**
 * A date in December 2026, for Itinerary content. Content is trusted and
 * checked by the Trip-rule tests, so the brand is applied without a runtime
 * check.
 */
export const december = (day: number) =>
  `2026-12-${String(day).padStart(2, '0')}` as IsoDate

export const PlaceId = Schema.Literals(placeIds)

/** A point on the map, in decimal degrees. */
export const Coordinates = Schema.Struct({
  latitude: Schema.Finite,
  longitude: Schema.Finite,
})
export type Coordinates = typeof Coordinates.Type

/** A place from the catalogue, with whether it's a New place for Phillip. */
export const Place = Schema.Struct({
  id: PlaceId,
  romaji: Schema.String,
  kanji: Schema.Literals(displayStrings),
  coordinates: Coordinates,
  newPlace: Schema.Boolean,
})
export type Place = typeof Place.Type

/** The number that labels an Itinerary, shown as "Option 1". */
export const OptionNumber = Schema.Int.check(Schema.isGreaterThan(0))

/** A Stay's accommodation: a ryokan only when the source says so. */
export const AccommodationKind = Schema.Literals(['hotel', 'ryokan'])
export type AccommodationKind = typeof AccommodationKind.Type

/**
 * Consecutive nights at one hotel. Its nights are derived from its dates. Its
 * highlights are sights the source lists for the Stay without assigning them
 * to a Day.
 */
export const Stay = Schema.Struct({
  base: PlaceId,
  checkIn: IsoDate,
  checkOut: IsoDate,
  accommodation: AccommodationKind,
  highlights: Schema.Array(Schema.String),
})
export type Stay = typeof Stay.Type

export const StationId = Schema.Literals(stationIds)

export const Station = Schema.Struct({
  id: StationId,
  name: Schema.String,
  coordinates: Coordinates,
})
export type Station = typeof Station.Type

export const RailSectionMode = Schema.Literals([
  'shinkansen',
  'limited-express',
])
export type RailSectionMode = typeof RailSectionMode.Type

export const RailLineId = Schema.Literals(railLineIds)

/** One train ridden without changing, from one station to another. */
export const RailSection = Schema.Struct({
  mode: RailSectionMode,
  line: RailLineId,
  from: StationId,
  to: StationId,
})
export type RailSection = typeof RailSection.Type

/**
 * A rough travel time in minutes. The minimum and maximum are equal when the
 * source gives one value.
 */
export const DurationRange = Schema.Struct({
  minMinutes: Schema.Int,
  maxMinutes: Schema.Int,
})
export type DurationRange = typeof DurationRange.Type

/** Local is a Move between two Stays in the same Base. */
export const MoveMode = Schema.Literals(['train', 'flight', 'local'])
export type MoveMode = typeof MoveMode.Type

/**
 * Switching hotels between the two Stays that meet on its date. Its rail
 * sections are in travel order. It has no duration when the source never
 * gives one, and a local Move has neither sections nor a duration.
 */
export const Move = Schema.Struct({
  date: IsoDate,
  mode: MoveMode,
  sections: Schema.Array(RailSection),
  duration: Schema.optionalKey(DurationRange),
})
export type Move = typeof Move.Type

/**
 * Going to another town and returning to the same Base on the same day. An
 * optional one is offered rather than planned, such as "Uji or a leisurely
 * Kyoto day" or "leave room for Enoshima".
 */
export const DayTrip = Schema.Struct({
  date: IsoDate,
  place: PlaceId,
  optional: Schema.Boolean,
})
export type DayTrip = typeof DayTrip.Type

/** One calendar date of the Trip, with what the source says about it. */
export const Day = Schema.Struct({
  date: IsoDate,
  description: Schema.optionalKey(Schema.String),
})
export type Day = typeof Day.Type

export const DaySlot = Schema.Literals(['morning', 'afternoon', 'evening'])
export type DaySlot = typeof DaySlot.Type

/** When an Itinerary plans to visit Shigeharu. The visit is tentative. */
export const ShigeharuVisit = Schema.Struct({ date: IsoDate, slot: DaySlot })
export type ShigeharuVisit = typeof ShigeharuVisit.Type

/**
 * A time-sensitive statement to confirm before relying on it, attached to a
 * Day by its date, a Stay by its check-in date, or the whole Itinerary.
 */
export const VerifyClaimAttachment = Schema.TaggedUnion({
  Day: { date: IsoDate },
  Stay: { checkIn: IsoDate },
  Itinerary: {},
})
export type VerifyClaimAttachment = typeof VerifyClaimAttachment.Type

export const VerifyClaim = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  attachedTo: VerifyClaimAttachment,
})
export type VerifyClaim = typeof VerifyClaim.Type

/**
 * gpt-6-astra's reasoning about an Itinerary. A field the source doesn't give
 * is absent: Option 1 has no "choose this if", only why it is recommended.
 */
export const ItineraryReasoning = Schema.Struct({
  birthdayOutline: Schema.String,
  pros: Schema.Array(Schema.String),
  cons: Schema.Array(Schema.String),
  chooseThisIf: Schema.optionalKey(Schema.String),
  whyRecommended: Schema.optionalKey(Schema.String),
  travelNotes: Schema.optionalKey(Schema.String),
})
export type ItineraryReasoning = typeof ItineraryReasoning.Type

/**
 * An Itinerary as converted from gpt-6-astra's markdown. Exactly one is
 * recommended by gpt-6-astra.
 */
export const ItineraryContent = Schema.Struct({
  optionNumber: OptionNumber,
  name: Schema.String,
  bestFor: Schema.String,
  recommended: Schema.Boolean,
  stays: Schema.Array(Stay),
  days: Schema.Array(Day),
  moves: Schema.Array(Move),
  dayTrips: Schema.Array(DayTrip),
  verifyClaims: Schema.Array(VerifyClaim),
  shigeharuVisit: Schema.optionalKey(ShigeharuVisit),
  ...ItineraryReasoning.fields,
})
export type ItineraryContent = typeof ItineraryContent.Type

/**
 * One candidate way to spend the Trip. The content version is a fingerprint
 * of its content that changes only when a Revision lands.
 */
export const Itinerary = Schema.Struct({
  ...ItineraryContent.fields,
  contentVersion: Schema.String,
})
export type Itinerary = typeof Itinerary.Type

const anchorFields = {
  Arrival: { date: IsoDate },
  ShigeharuVisit: {
    ...ShigeharuVisit.fields,
    tentative: Schema.Literal(true),
    thursdayBackup: Schema.Boolean,
  },
  Birthday: { date: IsoDate },
  Departure: { date: IsoDate },
}

/** A fixed date every Itinerary must respect. */
export const Anchor = Schema.TaggedUnion(anchorFields)
export type Anchor = typeof Anchor.Type

/** A Verify claim as shown where it's attached. */
export const VerifyClaimDetail = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
})
export type VerifyClaimDetail = typeof VerifyClaimDetail.Type

/** A Stay by its Base, dates and nights. */
export const StaySummary = Schema.Struct({
  base: Place,
  checkIn: IsoDate,
  checkOut: IsoDate,
  nights: Schema.Int,
})
export type StaySummary = typeof StaySummary.Type

export const StayDetail = Schema.Struct({
  ...Stay.fields,
  ...StaySummary.fields,
  verifyClaims: Schema.Array(VerifyClaimDetail),
})
export type StayDetail = typeof StayDetail.Type

export const RailSectionDetail = Schema.Struct({
  ...RailSection.fields,
  from: Station,
  to: Station,
})
export type RailSectionDetail = typeof RailSectionDetail.Type

/**
 * A Move as its Day shows it: the Bases of the two Stays it connects, and
 * each station where the train changes.
 */
export const MoveDetail = Schema.Struct({
  mode: MoveMode,
  from: Place,
  to: Place,
  sections: Schema.Array(RailSectionDetail),
  duration: Schema.optionalKey(DurationRange),
  changes: Schema.Array(Station),
})
export type MoveDetail = typeof MoveDetail.Type

export const DayTripDetail = Schema.Struct({
  place: Place,
  optional: Schema.Boolean,
})
export type DayTripDetail = typeof DayTripDetail.Type

export const DayDetail = Schema.Struct({
  ...Day.fields,
  anchors: Schema.Array(Anchor),
  move: Schema.optionalKey(MoveDetail),
  dayTrips: Schema.Array(DayTripDetail),
  verifyClaims: Schema.Array(VerifyClaimDetail),
  freeDay: Schema.Boolean,
})
export type DayDetail = typeof DayDetail.Type

/** The nights an Itinerary spends at one Base, across all its Stays there. */
export const BaseNights = Schema.Struct({ base: Place, nights: Schema.Int })
export type BaseNights = typeof BaseNights.Type

/** An Itinerary's character at a glance, derived from its data. */
export const ItinerarySummary = Schema.Struct({
  optionNumber: OptionNumber,
  name: Schema.String,
  recommended: Schema.Boolean,
  bestFor: Schema.String,
  /** Each Base in the order the Trip reaches it. */
  route: Schema.Array(Place),
  /** In the order the Trip first reaches each Base. */
  nightsPerBase: Schema.Array(BaseNights),
  /**
   * The New places among its Bases and Day trip destinations, optional Day
   * trips included, in the order the Trip first reaches them.
   */
  newToYou: Schema.Array(Place),
})
export type ItinerarySummary = typeof ItinerarySummary.Type

/** A Move by its date, how it travels and the Bases it connects. */
export const MoveSummary = Schema.Struct({
  date: IsoDate,
  mode: MoveMode,
  from: Place,
  to: Place,
})
export type MoveSummary = typeof MoveSummary.Type

/** An Itinerary's Moves at a glance. */
export const MovesComparison = Schema.Struct({
  count: Schema.Int,
  /**
   * The summed duration range of the train and flight Moves that have one;
   * absent when none has. A Move without one is never estimated.
   */
  travelTime: Schema.optionalKey(DurationRange),
  /** The train and flight Moves left out of the travel time. */
  durationNotGiven: Schema.Array(MoveSummary),
})
export type MovesComparison = typeof MovesComparison.Type

/**
 * An Itinerary on the comparison rows, every one derived from its data so a
 * Revision updates them.
 */
export const ItineraryComparison = Schema.Struct({
  ...ItinerarySummary.fields,
  /**
   * The Base whose Stay covers the night of December 15, absent only when no
   * Stay does, and the birthday outline.
   */
  birthday: Schema.Struct({
    base: Schema.optionalKey(Place),
    outline: Schema.String,
  }),
  moves: MovesComparison,
  /**
   * Whether all of Thursday, December 10 is spent in Kyoto and not moving, so
   * the Shigeharu visit can fall back to it.
   */
  thursdayBackup: Schema.Boolean,
  /**
   * Each Day trip destination once, in the order the Trip first goes there.
   * It is optional only when every Day trip there is.
   */
  dayTrips: Schema.Array(DayTripDetail),
  flights: Schema.Array(MoveSummary),
  ryokanStays: Schema.Array(StaySummary),
})
export type ItineraryComparison = typeof ItineraryComparison.Type

/**
 * A rail section as the map draws it: along its rail line, or straight
 * between its stations when the rail geometry lacks it.
 */
export const MapRailSection = Schema.Struct({
  ...RailSectionDetail.fields,
  followsRailLine: Schema.Boolean,
})
export type MapRailSection = typeof MapRailSection.Type

/**
 * A train Move as the map draws it: from the Base it leaves, along each of
 * its rail sections in turn, to the Base it reaches. Its stations join their
 * Bases with straight lines.
 */
export const MapTrainMove = Schema.Struct({
  date: IsoDate,
  path: Schema.Array(Coordinates),
})
export type MapTrainMove = typeof MapTrainMove.Type

/** A Day trip as the map draws it, from its Base to its destination. */
export const MapDayTrip = Schema.Struct({
  from: Place,
  to: Place,
  /** Optional only when every Day trip between the two is. */
  optional: Schema.Boolean,
})
export type MapDayTrip = typeof MapDayTrip.Type

/** An Itinerary on its map. Local Moves stay within a Base and draw nothing. */
export const ItineraryMap = Schema.Struct({
  /** Each Base once, in the order the Trip first reaches it. */
  bases: Schema.Array(Place),
  trainMoves: Schema.Array(MapTrainMove),
  /** Each flight from Base to Base, drawn as an arc. */
  flights: Schema.Array(MoveSummary),
  /** Each pair of Base and destination once, drawn dashed. */
  dayTrips: Schema.Array(MapDayTrip),
  /**
   * The credit the rail geometry's licence requires, present only when a
   * train Move follows a rail line.
   */
  railAttribution: Schema.optionalKey(Schema.String),
})
export type ItineraryMap = typeof ItineraryMap.Type

/** An Itinerary's Moves on the comparison map, drawn as on its own map. */
export const ComparisonMapItinerary = Schema.Struct({
  ...Struct.pick(ItinerarySummary.fields, ['optionNumber', 'recommended']),
  ...Struct.pick(ItineraryMap.fields, ['trainMoves', 'flights']),
})
export type ComparisonMapItinerary = typeof ComparisonMapItinerary.Type

/** Every Itinerary's Moves and Bases overlaid on one map. */
export const ComparisonMap = Schema.Struct({
  /** Each Base once, in the order the Itineraries first reach it. */
  bases: Schema.Array(Place),
  itineraries: Schema.Array(ComparisonMapItinerary),
  /**
   * The credit the rail geometry's licence requires, present only when a
   * train Move follows a rail line.
   */
  railAttribution: Schema.optionalKey(Schema.String),
})
export type ComparisonMap = typeof ComparisonMap.Type

/**
 * One Itinerary as its page shows it: its summary, Stays, all 15 Days,
 * gpt-6-astra's reasoning and its map.
 */
export const ItineraryDetail = Schema.Struct({
  ...ItinerarySummary.fields,
  ...ItineraryReasoning.fields,
  contentVersion: Schema.String,
  stays: Schema.Array(StayDetail),
  days: Schema.Array(DayDetail),
  /** The Verify claims about the Itinerary as a whole. */
  verifyClaims: Schema.Array(VerifyClaimDetail),
  map: ItineraryMap,
})
export type ItineraryDetail = typeof ItineraryDetail.Type

/** Why an Itinerary breaks the Trip's rules. */
export const TripRuleBreak = Schema.TaggedUnion({
  NoStays: {},
  NotTheTripDates: { checkIn: IsoDate, checkOut: IsoDate },
  StayWithoutNights: { checkIn: IsoDate },
  Gap: { from: IsoDate, to: IsoDate },
  Overlap: { from: IsoDate, to: IsoDate },
  NotTheTripDays: { dates: Schema.Array(IsoDate) },
  NotWakingUpInKyoto: { base: Schema.optionalKey(PlaceId) },
  ShigeharuMissing: {},
  ShigeharuWrongDate: { date: IsoDate },
  ShigeharuNotInMorning: { slot: DaySlot },
  MoveWithoutStayBoundary: { date: IsoDate },
  StayBoundaryWithoutMove: { date: IsoDate },
  MoveOnBirthday: {},
  UnattachedVerifyClaim: { id: Schema.String },
  EndsOutsideTokyo: { base: PlaceId },
})
export type TripRuleBreak = typeof TripRuleBreak.Type

/** The id of something copied into a Schedule, fresh in each Schedule. */
export const CopyId = Schema.String

export const ScheduleId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('ScheduleId'),
)
export type ScheduleId = typeof ScheduleId.Type

/**
 * The client-generated id of a write, recorded with its result so that a
 * retry returns that result instead of writing again.
 */
export const OperationId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('OperationId'),
)
export type OperationId = typeof OperationId.Type

/** An archived Schedule is read-only; at most one is current. */
export const ScheduleStatus = Schema.Literals(['current', 'archived'])
export type ScheduleStatus = typeof ScheduleStatus.Type

/** An Anchor as copied into a Schedule. */
export const ScheduleAnchor = Schema.TaggedUnion({
  Arrival: { id: CopyId, ...anchorFields.Arrival },
  ShigeharuVisit: { id: CopyId, ...anchorFields.ShigeharuVisit },
  Birthday: { id: CopyId, ...anchorFields.Birthday },
  Departure: { id: CopyId, ...anchorFields.Departure },
})
export type ScheduleAnchor = typeof ScheduleAnchor.Type

export const ScheduleStayDetail = Schema.Struct({
  id: CopyId,
  ...StayDetail.fields,
})
export type ScheduleStayDetail = typeof ScheduleStayDetail.Type

export const ScheduleDayDetail = Schema.Struct({
  ...DayDetail.fields,
  anchors: Schema.Array(ScheduleAnchor),
  move: Schema.optionalKey(Schema.Struct({ id: CopyId, ...MoveDetail.fields })),
  dayTrips: Schema.Array(
    Schema.Struct({ id: CopyId, ...DayTripDetail.fields }),
  ),
})
export type ScheduleDayDetail = typeof ScheduleDayDetail.Type

/** A Schedule's own fields: where it came from and when. */
export const ScheduleRecord = Schema.Struct({
  id: ScheduleId,
  status: ScheduleStatus,
  sourceOptionNumber: OptionNumber,
  /** The content version of the Itinerary when it was chosen. */
  sourceContentVersion: Schema.String,
  /** The moment it was chosen, as an ISO 8601 UTC string. */
  chosenAt: Schema.String,
  /** The moment it was last archived, as an ISO 8601 UTC string. */
  archivedAt: Schema.NullOr(Schema.String),
  birthdayOutline: Schema.String,
})
export type ScheduleRecord = typeof ScheduleRecord.Type

/**
 * What every page needs to know about Phillip's Schedule: which it is, and
 * the Itinerary it came from. Its absence means none is chosen yet.
 */
export const ScheduleSummary = Schema.Struct(
  Struct.pick(ScheduleRecord.fields, ['id', 'sourceOptionNumber']),
)
export type ScheduleSummary = typeof ScheduleSummary.Type

/**
 * The Itinerary a Schedule came from, now: unchanged since it was chosen,
 * revised since (a Revision notice), or no longer available.
 */
export const SourceItineraryStatus = Schema.Literals([
  'unchanged',
  'revised',
  'unavailable',
])
export type SourceItineraryStatus = typeof SourceItineraryStatus.Type

/**
 * Phillip's Schedule as its page shows it: where it came from, and its Stays
 * and all 15 Days as copied when he chose it. Its Verify claims carry their
 * copies' ids.
 */
export const ScheduleDetail = Schema.Struct({
  ...ScheduleRecord.fields,
  sourceItinerary: SourceItineraryStatus,
  /** The Verify claims about the Schedule as a whole. */
  verifyClaims: Schema.Array(VerifyClaimDetail),
  stays: Schema.Array(ScheduleStayDetail),
  days: Schema.Array(ScheduleDayDetail),
})
export type ScheduleDetail = typeof ScheduleDetail.Type

/** An archived Schedule as /schedule lists it. */
export const ArchivedScheduleSummary = Schema.Struct({
  ...Struct.pick(ScheduleRecord.fields, [
    'id',
    'sourceOptionNumber',
    'chosenAt',
  ]),
  archivedAt: Schema.String,
})
export type ArchivedScheduleSummary = typeof ArchivedScheduleSummary.Type

/**
 * Choose an Itinerary, making a fresh copy of it Phillip's Schedule. It names
 * the current Schedule it archives, or null when there is none yet.
 */
export const ChooseItinerary = Schema.Struct({
  operationId: OperationId,
  optionNumber: OptionNumber,
  replacing: Schema.NullOr(ScheduleId),
})
export type ChooseItinerary = typeof ChooseItinerary.Type

export const ScheduleChosen = Schema.Struct({ scheduleId: ScheduleId })
export type ScheduleChosen = typeof ScheduleChosen.Type

/** Restore an archived Schedule, archiving the current one it names. */
export const RestoreSchedule = Schema.Struct({
  operationId: OperationId,
  scheduleId: ScheduleId,
  replacing: Schema.NullOr(ScheduleId),
})
export type RestoreSchedule = typeof RestoreSchedule.Type

export const ScheduleRestored = Schema.Struct({ scheduleId: ScheduleId })
export type ScheduleRestored = typeof ScheduleRestored.Type

export class ScheduleNotFound extends Schema.TaggedError<ScheduleNotFound>()(
  'ScheduleNotFound',
  { scheduleId: ScheduleId },
) {}

export class ItineraryNotFound extends Schema.TaggedError<ItineraryNotFound>()(
  'ItineraryNotFound',
  { optionNumber: Schema.Int },
) {}

/**
 * Whole Tokyo calendar dates until the Trip starts at 00:00 on December 6 in
 * Tokyo, or Ended once that moment has passed. The time of day never changes
 * the count.
 */
export const Countdown = Schema.TaggedUnion({
  Counting: { days: Schema.Int },
  Ended: {},
})
export type Countdown = typeof Countdown.Type

export const HomeState = Schema.Struct({
  countdown: Countdown,
  itineraries: Schema.Array(ItinerarySummary),
})
export type HomeState = typeof HomeState.Type

/**
 * A write named a Schedule that isn't current, or none while one is: it was
 * made on an out-of-date screen. Archived Schedules reject every write this
 * way, and nothing is written.
 */
export class ScheduleChanged extends Schema.TaggedError<ScheduleChanged>()(
  'ScheduleChanged',
  {},
) {}

/** What choosing an Itinerary did, as plain data for the browser. */
export const ChooseOutcome = Schema.TaggedUnion({
  Chosen: ScheduleChosen.fields,
  ItineraryNotFound: ItineraryNotFound.fields,
  ScheduleChanged: ScheduleChanged.fields,
})
export type ChooseOutcome = typeof ChooseOutcome.Type

/** What restoring a Schedule did, as plain data for the browser. */
export const RestoreOutcome = Schema.TaggedUnion({
  Restored: ScheduleRestored.fields,
  ScheduleNotFound: ScheduleNotFound.fields,
  ScheduleChanged: ScheduleChanged.fields,
})
export type RestoreOutcome = typeof RestoreOutcome.Type
