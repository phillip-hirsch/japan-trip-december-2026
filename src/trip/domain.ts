// The Trip's domain types, named as in CONTEXT.md. The schemas run on the
// server only; the browser imports these types with `import type`.
import { DateTime, Option, Schema } from 'effect'

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

/** A place from the catalogue, with whether it's a New place for Phillip. */
export const Place = Schema.Struct({
  id: PlaceId,
  romaji: Schema.String,
  kanji: Schema.Literals(displayStrings),
  coordinates: Schema.Struct({
    latitude: Schema.Finite,
    longitude: Schema.Finite,
  }),
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

export const Station = Schema.Struct({ id: StationId, name: Schema.String })
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
 * optional one includes an either-or choice such as "Uji or a leisurely Kyoto
 * day".
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

/** A fixed date every Itinerary must respect. */
export const Anchor = Schema.TaggedUnion({
  Arrival: { date: IsoDate },
  ShigeharuVisit: {
    ...ShigeharuVisit.fields,
    tentative: Schema.Literal(true),
    thursdayBackup: Schema.Boolean,
  },
  Birthday: { date: IsoDate },
  Departure: { date: IsoDate },
})
export type Anchor = typeof Anchor.Type

/** A Verify claim as shown where it's attached. */
export const VerifyClaimDetail = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
})
export type VerifyClaimDetail = typeof VerifyClaimDetail.Type

export const StayDetail = Schema.Struct({
  ...Stay.fields,
  base: Place,
  nights: Schema.Int,
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

/**
 * One Itinerary as its page shows it: its summary, Stays, all 15 Days and
 * gpt-6-astra's reasoning.
 */
export const ItineraryDetail = Schema.Struct({
  ...ItinerarySummary.fields,
  ...ItineraryReasoning.fields,
  contentVersion: Schema.String,
  stays: Schema.Array(StayDetail),
  days: Schema.Array(DayDetail),
  /** The Verify claims about the Itinerary as a whole. */
  verifyClaims: Schema.Array(VerifyClaimDetail),
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
