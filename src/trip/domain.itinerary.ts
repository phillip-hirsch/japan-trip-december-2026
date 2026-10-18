import { DateTime, Option, Schema, Struct } from 'effect'

import { displayStrings } from '@/fonts/display-strings'
import { isCalendarDate } from '@/trip/calendar'
import { placeIds, railLineIds, stationIds } from '@/trip/catalogue-ids'

/** A calendar date in Tokyo time, as YYYY-MM-DD. */
export const IsoDate = Schema.String.check(
  Schema.makeFilter(isCalendarDate),
).pipe(Schema.brand('IsoDate'))

export type IsoDate = typeof IsoDate.Type

export const IsoInstant = Schema.String.check(
  Schema.makeFilter((instant: string) =>
    Option.exists(
      DateTime.make(instant),
      (parsed) => DateTime.formatIso(parsed) === instant,
    ),
  ),
).pipe(Schema.brand('IsoInstant'))

export type IsoInstant = typeof IsoInstant.Type

export const december = (day: number) =>
  IsoDate.make(`2026-12-${String(day).padStart(2, '0')}`)

export const PlaceId = Schema.Literals(placeIds)

export const Coordinates = Schema.Struct({
  latitude: Schema.Finite,
  longitude: Schema.Finite,
})

export type Coordinates = typeof Coordinates.Type

export const Place = Schema.Struct({
  id: PlaceId,
  romaji: Schema.String,
  kanji: Schema.Literals(displayStrings),
  coordinates: Coordinates,
  newPlace: Schema.Boolean,
})

export type Place = typeof Place.Type

export const OptionNumber = Schema.Int.check(Schema.isGreaterThan(0))

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

export const Day = Schema.Struct({
  date: IsoDate,
  description: Schema.optionalKey(Schema.String),
})

export type Day = typeof Day.Type

export const DaySlot = Schema.Literals(['morning', 'afternoon', 'evening'])

export type DaySlot = typeof DaySlot.Type

export const ShigeharuVisit = Schema.Struct({ date: IsoDate, slot: DaySlot })

export type ShigeharuVisit = typeof ShigeharuVisit.Type

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

export const anchorFields = {
  Arrival: { date: IsoDate },
  ShigeharuVisit: {
    ...ShigeharuVisit.fields,
    tentative: Schema.Literal(true),
    thursdayBackup: Schema.Boolean,
  },
  Birthday: { date: IsoDate },
  Departure: { date: IsoDate },
}

export const Anchor = Schema.TaggedUnion(anchorFields)

export type Anchor = typeof Anchor.Type

export const VerifyClaimDetail = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
})

export type VerifyClaimDetail = typeof VerifyClaimDetail.Type

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

export const MoveSummary = Schema.Struct({
  date: IsoDate,
  mode: MoveMode,
  from: Place,
  to: Place,
})

export type MoveSummary = typeof MoveSummary.Type

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
 * A Move between two Bases as the map draws it, other than a flight: from
 * the Base it leaves, along each of its rail sections in turn, to the Base it
 * reaches. Its stations join their Bases with straight lines, and a Move
 * without rail sections, such as after a Stay edit, is one straight line.
 */
export const MapTrainMove = Schema.Struct({
  date: IsoDate,
  path: Schema.Array(Coordinates),
})

export type MapTrainMove = typeof MapTrainMove.Type

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

export const ComparisonMapItinerary = Schema.Struct({
  ...Struct.pick(ItinerarySummary.fields, ['optionNumber', 'recommended']),
  ...Struct.pick(ItineraryMap.fields, ['trainMoves', 'flights']),
})

export type ComparisonMapItinerary = typeof ComparisonMapItinerary.Type

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

/**
 * The Hard rules on Stay dates, which every Itinerary keeps too: Stays from
 * December 6 to December 20, back to back with no Gap or Overlap, each at
 * least one night.
 */
export const stayDateRules = {
  NoStays: {},
  NotTheTripDates: { checkIn: IsoDate, checkOut: IsoDate },
  StayWithoutNights: { checkIn: IsoDate },
  Gap: { from: IsoDate, to: IsoDate },
  Overlap: { from: IsoDate, to: IsoDate },
}

export const StayDateRuleBreak = Schema.TaggedUnion(stayDateRules)

export type StayDateRuleBreak = typeof StayDateRuleBreak.Type

const anchorWarnings = {
  /**
   * The Stay covering the night of December 10 isn't in Kyoto, at the Base
   * given, so Phillip doesn't wake up there for the Shigeharu visit. No Base
   * when no Stay covers that night.
   */
  NotWakingUpInKyoto: { base: Schema.optionalKey(PlaceId) },
  MoveOnBirthday: {},
  /** The last Stay, before flying home, is at the Base given, not Tokyo. */
  EndsOutsideTokyo: { base: PlaceId },
}

/**
 * An Anchor the Schedule breaks, or its last Stay outside Tokyo. The Schedule
 * page shows it, and it never blocks a Stay edit.
 */
export const AnchorWarning = Schema.TaggedUnion(anchorWarnings)

export type AnchorWarning = typeof AnchorWarning.Type

/**
 * Why an Itinerary breaks the Trip's rules. The cases are the Hard rules on
 * Stay dates, the Anchor warnings, which an Itinerary must not have, and
 * checks on its own content.
 */
export const TripRuleBreak = Schema.TaggedUnion({
  ...stayDateRules,
  ...anchorWarnings,
  NotTheTripDays: { dates: Schema.Array(IsoDate) },
  ShigeharuMissing: {},
  ShigeharuWrongDate: { date: IsoDate },
  ShigeharuNotInMorning: { slot: DaySlot },
  MoveWithoutStayBoundary: { date: IsoDate },
  MovesOnOneDate: { date: IsoDate },
  StayBoundaryWithoutMove: { date: IsoDate },
  UnattachedVerifyClaim: { id: Schema.String },
})

export type TripRuleBreak = typeof TripRuleBreak.Type

export class ItineraryNotFound extends Schema.TaggedError<ItineraryNotFound>()(
  'ItineraryNotFound',
  { optionNumber: Schema.Int },
) {}
