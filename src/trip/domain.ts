// The Trip's domain types, named as in CONTEXT.md. The schemas run on the
// server only; the browser imports these types with `import type`.
import { DateTime, Option, Schema } from 'effect'

import { displayStrings } from '@/fonts/display-strings'
import { placeIds } from '@/trip/places'

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

/** Consecutive nights at one hotel. Its nights are derived from its dates. */
export const Stay = Schema.Struct({
  base: PlaceId,
  checkIn: IsoDate,
  checkOut: IsoDate,
})
export type Stay = typeof Stay.Type

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

/** An Itinerary as converted from gpt-6-astra's markdown. */
export const ItineraryContent = Schema.Struct({
  optionNumber: OptionNumber,
  name: Schema.String,
  stays: Schema.Array(Stay),
  days: Schema.Array(Day),
  shigeharuVisit: Schema.optionalKey(ShigeharuVisit),
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

export const StayDetail = Schema.Struct({
  ...Stay.fields,
  base: Place,
  nights: Schema.Int,
})
export type StayDetail = typeof StayDetail.Type

export const DayDetail = Schema.Struct({
  ...Day.fields,
  anchors: Schema.Array(Anchor),
  /** Until Moves are content, a Move is inferred from a Stay boundary. */
  move: Schema.optionalKey(Schema.Struct({ from: Place, to: Place })),
  freeDay: Schema.Boolean,
})
export type DayDetail = typeof DayDetail.Type

export const ItinerarySummary = Schema.Struct({
  optionNumber: OptionNumber,
  name: Schema.String,
})
export type ItinerarySummary = typeof ItinerarySummary.Type

/** One Itinerary as its page shows it: its Stays and all 15 Days. */
export const ItineraryDetail = Schema.Struct({
  ...ItinerarySummary.fields,
  contentVersion: Schema.String,
  stays: Schema.Array(StayDetail),
  days: Schema.Array(DayDetail),
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
  MoveOnBirthday: {},
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
