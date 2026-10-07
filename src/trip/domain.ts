// The Trip's domain types, named as in GLOSSARY.md. For browser imports, see
// AGENTS.md: Effect in the browser.
import { DateTime, Option, Schema, Struct } from 'effect'

import { displayStrings } from '@/fonts/display-strings'
import { timeOfDayPattern } from '@/trip/calendar'
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
 * checked by the Trip-rule tests; the constructor also checks the date.
 */
export const december = (day: number) =>
  IsoDate.make(`2026-12-${String(day).padStart(2, '0')}`)

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

/**
 * The Hard rules on Stay dates, which every Itinerary keeps too: Stays from
 * December 6 to December 20, back to back with no Gap or Overlap, each at
 * least one night.
 */
const stayDateRules = {
  NoStays: {},
  NotTheTripDates: { checkIn: IsoDate, checkOut: IsoDate },
  StayWithoutNights: { checkIn: IsoDate },
  Gap: { from: IsoDate, to: IsoDate },
  Overlap: { from: IsoDate, to: IsoDate },
}

/** How Stays break the Hard rules on Stay dates. */
export const StayDateRuleBreak = Schema.TaggedUnion(stayDateRules)

export type StayDateRuleBreak = typeof StayDateRuleBreak.Type

const anchorWarnings = {
  /**
   * The Stay covering the night of December 10 isn't in Kyoto, at the Base
   * given, so Phillip doesn't wake up there for the Shigeharu visit. No Base
   * when no Stay covers that night.
   */
  NotWakingUpInKyoto: { base: Schema.optionalKey(PlaceId) },
  /** A Move on December 15, the Birthday. */
  MoveOnBirthday: {},
  /** The last Stay, before flying home, is at the Base given, not Tokyo. */
  EndsOutsideTokyo: { base: PlaceId },
}

/**
 * An Anchor the Schedule breaks, or its last Stay outside Tokyo: shown on the
 * Schedule page, never blocking a Stay edit.
 */
export const AnchorWarning = Schema.TaggedUnion(anchorWarnings)

export type AnchorWarning = typeof AnchorWarning.Type

/**
 * Why an Itinerary breaks the Trip's rules: the Hard rules on Stay dates, the
 * Anchor warnings, which an Itinerary never may, and its content's own.
 */
export const TripRuleBreak = Schema.TaggedUnion({
  ...stayDateRules,
  ...anchorWarnings,
  NotTheTripDays: { dates: Schema.Array(IsoDate) },
  ShigeharuMissing: {},
  ShigeharuWrongDate: { date: IsoDate },
  ShigeharuNotInMorning: { slot: DaySlot },
  MoveWithoutStayBoundary: { date: IsoDate },
  StayBoundaryWithoutMove: { date: IsoDate },
  UnattachedVerifyClaim: { id: Schema.String },
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

/**
 * Phillip's Hotel details on a Stay: its hotel's name, address and
 * confirmation number, each absent until he records it.
 */
export const HotelDetails = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  address: Schema.optionalKey(Schema.String),
  confirmationNumber: Schema.optionalKey(Schema.String),
})

export type HotelDetails = typeof HotelDetails.Type

/**
 * A Stay's hotel: its Hotel details once Phillip records any, and until then
 * not recorded, so a Day page shows the Base marked "hotel not recorded".
 */
export const Hotel = Schema.TaggedUnion({
  NotRecorded: {},
  Recorded: HotelDetails.fields,
})

export type Hotel = typeof Hotel.Type

export const ScheduleStayDetail = Schema.Struct({
  id: CopyId,
  ...StayDetail.fields,
  /** Phillip's Stay note, absent until he writes one. */
  note: Schema.optionalKey(Schema.String),
  hotel: Hotel,
})

export type ScheduleStayDetail = typeof ScheduleStayDetail.Type

/** A Move as copied into a Schedule, as its Day shows it. */
export const ScheduleMoveDetail = Schema.Struct({
  id: CopyId,
  ...MoveDetail.fields,
})

export type ScheduleMoveDetail = typeof ScheduleMoveDetail.Type

/** An Activity's id, fresh for each Activity Phillip adds. */
export const ActivityId = Schema.String

/** A time of day in Tokyo, as HH:MM on the 24-hour clock. */
export const TimeOfDay = Schema.String.check(
  Schema.isPattern(timeOfDayPattern),
).pipe(Schema.brand('TimeOfDay'))

export type TimeOfDay = typeof TimeOfDay.Type

/**
 * One thing planned on a Day of the Schedule. Its time is a zoned date-time
 * in Asia/Tokyo on its Day's date, as ISO 8601 with the zone, such as
 * 2026-12-15T19:00:00.000+09:00[Asia/Tokyo].
 */
export const Activity = Schema.Struct({
  id: ActivityId,
  title: Schema.String,
  /** Absent for an Activity without a time. */
  time: Schema.optionalKey(Schema.String),
  /** Absent until Phillip writes one. */
  note: Schema.optionalKey(Schema.String),
})

export type Activity = typeof Activity.Type

export const ScheduleDayDetail = Schema.Struct({
  ...DayDetail.fields,
  /** Phillip's Day note, absent until he writes one. */
  note: Schema.optionalKey(Schema.String),
  /** Phillip's Activities, in the order he keeps them. */
  activities: Schema.Array(Activity),
  anchors: Schema.Array(ScheduleAnchor),
  move: Schema.optionalKey(ScheduleMoveDetail),
  dayTrips: Schema.Array(
    Schema.Struct({ id: CopyId, ...DayTripDetail.fields }),
  ),
})

export type ScheduleDayDetail = typeof ScheduleDayDetail.Type

/** Tonight's hotel: the Stay covering the night a Day ends with. */
export const TonightsHotel = Schema.Struct({
  id: CopyId,
  ...StaySummary.fields,
  hotel: Hotel,
})

export type TonightsHotel = typeof TonightsHotel.Type

/** The next Move from a Day: the first dated that Day or later. */
export const NextMove = Schema.Struct({
  date: IsoDate,
  ...ScheduleMoveDetail.fields,
})

export type NextMove = typeof NextMove.Type

/**
 * A Day of Phillip's Schedule as its page shows it, and as Home shows Today
 * during the Trip.
 */
export const DayPage = Schema.Struct({
  /** The Schedule the Day belongs to, which every write to it names. */
  scheduleId: ScheduleId,
  day: ScheduleDayDetail,
  /** Absent on December 20, the Departure Day, when Phillip flies home. */
  tonight: Schema.optionalKey(TonightsHotel),
  /** Absent once no Moves are left. */
  nextMove: Schema.optionalKey(NextMove),
})

export type DayPage = typeof DayPage.Type

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
  /**
   * Derived from its Stays and Moves each time it's read, in Trip order, so
   * none goes away until the Schedule stops breaking it.
   */
  anchorWarnings: Schema.Array(AnchorWarning),
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
 * Phillip's Schedules as /schedule shows them: the current one, if chosen,
 * the archived ones, most recently archived first, and the Trip note. Read
 * together, so the page never shows two moments at once.
 */
export const Schedules = Schema.Struct({
  current: Schema.NullOr(ScheduleDetail),
  archived: Schema.Array(ArchivedScheduleSummary),
  /** Phillip's Trip note, absent until he writes one. */
  tripNote: Schema.optionalKey(Schema.String),
})

export type Schedules = typeof Schedules.Type

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

/** The date is not a Day of the Trip, December 6 through December 20. */
export class DayNotFound extends Schema.TaggedError<DayNotFound>()(
  'DayNotFound',
  { date: IsoDate },
) {}

/** What every Home state carries. */
const homeFields = {
  /**
   * The moment of the Clock the state was read at, as an ISO 8601 UTC
   * string. The browser counts from it to the next Tokyo midnight.
   */
  readAt: Schema.String,
  /** The Itineraries, shown until Phillip has chosen one. */
  itineraries: Schema.Array(ItinerarySummary),
}

/**
 * What Home shows, by where the moment falls relative to the Trip in Tokyo:
 * 00:00 on December 6 to 23:59:59.999 on December 20, inclusive.
 */
export const HomeState = Schema.TaggedUnion({
  BeforeTrip: {
    ...homeFields,
    /**
     * Whole Tokyo calendar dates until the Trip starts. The time of day never
     * changes the count.
     */
    daysToGo: Schema.Int,
    schedule: Schema.NullOr(ScheduleDetail),
  },
  DuringTrip: {
    ...homeFields,
    /** The Day in Tokyo. */
    date: IsoDate,
    /** Today: that Day's page, null until a Schedule exists. */
    today: Schema.NullOr(DayPage),
  },
  AfterTrip: {
    ...homeFields,
    /** The Schedule as a record. */
    schedule: Schema.NullOr(ScheduleDetail),
  },
})

export type HomeState = typeof HomeState.Type

/** What reading a Day page found, as plain data for the browser. */
export const DayOutcome = Schema.TaggedUnion({
  Day: { page: DayPage },
  NoSchedule: {},
  DayNotFound: DayNotFound.fields,
})

export type DayOutcome = typeof DayOutcome.Type

/**
 * A write named a Schedule that isn't current, or none while one is: it was
 * made on an out-of-date screen. Archived Schedules reject every write this
 * way, and nothing is written.
 */
export class ScheduleChanged extends Schema.TaggedError<ScheduleChanged>()(
  'ScheduleChanged',
  {},
) {}

/**
 * Write the Day note on a Day of the Schedule named, as a whole value: an
 * empty note removes it. The last write wins.
 */
export const WriteDayNote = Schema.Struct({
  scheduleId: ScheduleId,
  date: IsoDate,
  note: Schema.String,
})

export type WriteDayNote = typeof WriteDayNote.Type

/** A note longer than the Trip service accepts; nothing is written. */
export class NoteTooLong extends Schema.TaggedError<NoteTooLong>()(
  'NoteTooLong',
  { maxLength: Schema.Int },
) {}

/** What writing a Day note did, as plain data for the browser. */
export const WriteDayNoteOutcome = Schema.TaggedUnion({
  Written: {},
  ScheduleChanged: ScheduleChanged.fields,
  DayNotFound: DayNotFound.fields,
  NoteTooLong: NoteTooLong.fields,
})

export type WriteDayNoteOutcome = typeof WriteDayNoteOutcome.Type

/** The Schedule named has no Stay with that id, such as one since replaced. */
export class StayNotFound extends Schema.TaggedError<StayNotFound>()(
  'StayNotFound',
  { stayId: CopyId },
) {}

/**
 * Write the Stay note on a Stay of the Schedule named, as a whole value: an
 * empty note removes it. The last write wins.
 */
export const WriteStayNote = Schema.Struct({
  scheduleId: ScheduleId,
  stayId: CopyId,
  note: Schema.String,
})

export type WriteStayNote = typeof WriteStayNote.Type

/** What writing a Stay note did, as plain data for the browser. */
export const WriteStayNoteOutcome = Schema.TaggedUnion({
  Written: {},
  ScheduleChanged: ScheduleChanged.fields,
  StayNotFound: StayNotFound.fields,
  NoteTooLong: NoteTooLong.fields,
})

export type WriteStayNoteOutcome = typeof WriteStayNoteOutcome.Type

/**
 * Write the Hotel details on a Stay of the Schedule named, as a whole value:
 * each field is trimmed, a blank one is removed, and all blank removes them,
 * so the Stay's hotel is not recorded again. The last write wins.
 */
export const WriteHotelDetails = Schema.Struct({
  scheduleId: ScheduleId,
  stayId: CopyId,
  details: HotelDetails,
})

export type WriteHotelDetails = typeof WriteHotelDetails.Type

/** A Hotel details field longer than the Trip service accepts. */
export class HotelDetailTooLong extends Schema.TaggedError<HotelDetailTooLong>()(
  'HotelDetailTooLong',
  { maxLength: Schema.Int },
) {}

/**
 * The Hard rule a Stay edit would break, so it's refused and nothing changes:
 * one on Stay dates, or one the edit itself can't apply. Merging needs two
 * adjacent Stays in one Base, and a Base can change only to a place in the
 * catalogue.
 */
export const HardRule = Schema.TaggedUnion({
  ...stayDateRules,
  StaysNotAdjacent: {},
  StaysInDifferentBases: {},
  PlaceNotInCatalogue: { place: Schema.String },
})

export type HardRule = typeof HardRule.Type

/** A Stay edit refused by the Hard rule named; nothing is written. */
export class HardRuleBroken extends Schema.TaggedError<HardRuleBroken>()(
  'HardRuleBroken',
  { rule: HardRule },
) {}

/**
 * The Schedule a Stay edit names, which it refuses unless current, and the
 * client-generated id a Stay edit that creates something carries, so a retry
 * returns its result instead of editing again.
 */
export const StayEditTarget = Schema.Struct({
  scheduleId: ScheduleId,
  operationId: Schema.optionalKey(OperationId),
})

export type StayEditTarget = typeof StayEditTarget.Type

/** What a Stay edit did: the Schedule as edited, with its Anchor warnings. */
export const StaysEdited = Schema.Struct({ schedule: ScheduleDetail })

export type StaysEdited = typeof StaysEdited.Type

/** What a Stay edit did, as plain data for the browser. */
export const StayEditOutcome = Schema.TaggedUnion({
  Edited: StaysEdited.fields,
  ScheduleChanged: ScheduleChanged.fields,
  StayNotFound: StayNotFound.fields,
  HardRuleBroken: HardRuleBroken.fields,
})

export type StayEditOutcome = typeof StayEditOutcome.Type

/** What writing Hotel details did, as plain data for the browser. */
export const WriteHotelDetailsOutcome = Schema.TaggedUnion({
  Written: {},
  ScheduleChanged: ScheduleChanged.fields,
  StayNotFound: StayNotFound.fields,
  HotelDetailTooLong: HotelDetailTooLong.fields,
})

export type WriteHotelDetailsOutcome = typeof WriteHotelDetailsOutcome.Type

/**
 * Write the Trip note, as a whole value: an empty note removes it. It belongs
 * to the Trip, not a Schedule, so it names none. The last write wins.
 */
export const WriteTripNote = Schema.Struct({ note: Schema.String })

export type WriteTripNote = typeof WriteTripNote.Type

/** What writing the Trip note did, as plain data for the browser. */
export const WriteTripNoteOutcome = Schema.TaggedUnion({
  Written: {},
  NoteTooLong: NoteTooLong.fields,
})

export type WriteTripNoteOutcome = typeof WriteTripNoteOutcome.Type

/**
 * Add an Activity on a Day of the Schedule named. A timed one goes before
 * the first Activity with a later time; one without a time goes last.
 */
export const AddActivity = Schema.Struct({
  operationId: OperationId,
  scheduleId: ScheduleId,
  date: IsoDate,
  title: Schema.String,
  time: Schema.optionalKey(TimeOfDay),
  note: Schema.optionalKey(Schema.String),
})

export type AddActivity = typeof AddActivity.Type

export const ActivityAdded = Schema.Struct({ activityId: ActivityId })

export type ActivityAdded = typeof ActivityAdded.Type

/**
 * Edit an Activity of the Schedule named, writing only the fields it
 * carries, so the last write wins for each field. A null time or an empty
 * note removes it. Its Day never changes.
 */
export const EditActivity = Schema.Struct({
  scheduleId: ScheduleId,
  activityId: ActivityId,
  title: Schema.optionalKey(Schema.String),
  time: Schema.optionalKey(Schema.NullOr(TimeOfDay)),
  note: Schema.optionalKey(Schema.String),
})

export type EditActivity = typeof EditActivity.Type

/** Remove an Activity of the Schedule named. */
export const RemoveActivity = Schema.Struct({
  scheduleId: ScheduleId,
  activityId: ActivityId,
})

export type RemoveActivity = typeof RemoveActivity.Type

/**
 * Move an Activity of the Schedule named to just before another on its Day,
 * or after the rest when that is null.
 */
export const MoveActivity = Schema.Struct({
  scheduleId: ScheduleId,
  activityId: ActivityId,
  before: Schema.NullOr(ActivityId),
})

export type MoveActivity = typeof MoveActivity.Type

/**
 * The Schedule named has no Activity with that id on the Day concerned, such
 * as one removed on another device.
 */
export class ActivityNotFound extends Schema.TaggedError<ActivityNotFound>()(
  'ActivityNotFound',
  { activityId: ActivityId },
) {}

/** An Activity's title is blank or too long; nothing is written. */
export class ActivityTitleInvalid extends Schema.TaggedError<ActivityTitleInvalid>()(
  'ActivityTitleInvalid',
  { maxLength: Schema.Int },
) {}

/** What adding an Activity did, as plain data for the browser. */
export const AddActivityOutcome = Schema.TaggedUnion({
  Added: ActivityAdded.fields,
  ScheduleChanged: ScheduleChanged.fields,
  DayNotFound: DayNotFound.fields,
  ActivityTitleInvalid: ActivityTitleInvalid.fields,
  NoteTooLong: NoteTooLong.fields,
})

export type AddActivityOutcome = typeof AddActivityOutcome.Type

/** What editing an Activity did, as plain data for the browser. */
export const EditActivityOutcome = Schema.TaggedUnion({
  Edited: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
  ActivityTitleInvalid: ActivityTitleInvalid.fields,
  NoteTooLong: NoteTooLong.fields,
})

export type EditActivityOutcome = typeof EditActivityOutcome.Type

/** What removing an Activity did, as plain data for the browser. */
export const RemoveActivityOutcome = Schema.TaggedUnion({
  Removed: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
})

export type RemoveActivityOutcome = typeof RemoveActivityOutcome.Type

/** What moving an Activity did, as plain data for the browser. */
export const MoveActivityOutcome = Schema.TaggedUnion({
  Moved: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
})

export type MoveActivityOutcome = typeof MoveActivityOutcome.Type

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

/**
 * The id of a Checklist item: for one derived from the Schedule, the id of
 * what it refers to, such as a Stay; for one of Phillip's own, its own.
 */
export const ChecklistItemId = Schema.String

/** A Move on the Checklist: its date and the Bases it connects. */
export const ChecklistMove = Schema.Struct(
  Struct.pick(MoveSummary.fields, ['date', 'from', 'to']),
)

export type ChecklistMove = typeof ChecklistMove.Type

const checklistItemFields = { id: ChecklistItemId, ticked: Schema.Boolean }

/**
 * One thing to book or confirm. All but Phillip's own are derived from the
 * Schedule each time it's read, and ticked only while what they refer to
 * still exists in it. A reminder date is only shown: nothing is sent.
 */
export const ChecklistItem = Schema.TaggedUnion({
  /** "Book hotel" for a Stay. */
  BookHotel: { ...checklistItemFields, stay: StaySummary },
  /**
   * "Reserve seats" for a train Move, reminded one month before it, when
   * reservations roughly open: a date to verify.
   */
  ReserveSeats: {
    ...checklistItemFields,
    move: ChecklistMove,
    reminderDate: IsoDate,
    verify: Schema.Literal('reminder-date'),
  },
  /** "Book flight" for a flight Move, to verify when booking opens. */
  BookFlight: {
    ...checklistItemFields,
    move: ChecklistMove,
    verify: Schema.Literal('when-booking-opens'),
  },
  /** "Confirm Shigeharu is open" on the day of the Shigeharu visit. */
  ConfirmShigeharu: { ...checklistItemFields, date: IsoDate },
  /** "Reserve birthday dinner" for the Birthday. */
  ReserveBirthdayDinner: { ...checklistItemFields, date: IsoDate },
  /** One Verify claim, even when it overlaps an Anchor item. */
  VerifyClaim: {
    ...checklistItemFields,
    text: Schema.String,
    attachedTo: VerifyClaimAttachment,
  },
  /** Phillip's own, belonging to the Trip rather than a Schedule. */
  Own: {
    ...checklistItemFields,
    text: Schema.String,
    reminderDate: Schema.optionalKey(IsoDate),
  },
})

export type ChecklistItem = typeof ChecklistItem.Type

/**
 * The Checklist as /checklist shows it: the next thing to do on top. Items
 * without a reminder date come first, in Trip order, then items by reminder
 * date, then Trip order (Phillip's own after the rest on the same date), and
 * last his own without a reminder date, oldest first.
 */
export const Checklist = Schema.Struct({
  /**
   * The Schedule its derived items come from, which every tick on them
   * names; null before Phillip chooses one, when only his own items show.
   */
  scheduleId: Schema.NullOr(ScheduleId),
  items: Schema.Array(ChecklistItem),
})

export type Checklist = typeof Checklist.Type

/**
 * Set the tick on an item derived from the Schedule named, to true or false,
 * never toggled. It is kept with that Schedule, by what the item refers to.
 */
export const TickChecklistItem = Schema.Struct({
  scheduleId: ScheduleId,
  itemId: ChecklistItemId,
  ticked: Schema.Boolean,
})

export type TickChecklistItem = typeof TickChecklistItem.Type

/**
 * Set the tick on one of Phillip's own Checklist items, to true or false. It
 * belongs to the Trip, not a Schedule, so it names none.
 */
export const TickOwnChecklistItem = Schema.Struct({
  itemId: ChecklistItemId,
  ticked: Schema.Boolean,
})

export type TickOwnChecklistItem = typeof TickOwnChecklistItem.Type

/** Add one of Phillip's own Checklist items, unticked. */
export const AddOwnChecklistItem = Schema.Struct({
  operationId: OperationId,
  text: Schema.String,
  reminderDate: Schema.optionalKey(IsoDate),
})

export type AddOwnChecklistItem = typeof AddOwnChecklistItem.Type

export const OwnChecklistItemAdded = Schema.Struct({ itemId: ChecklistItemId })

export type OwnChecklistItemAdded = typeof OwnChecklistItemAdded.Type

/** Remove one of Phillip's own Checklist items; one already gone stays so. */
export const RemoveOwnChecklistItem = Schema.Struct({ itemId: ChecklistItemId })

export type RemoveOwnChecklistItem = typeof RemoveOwnChecklistItem.Type

/** No Checklist item has that id, such as one since removed or replaced. */
export class ChecklistItemNotFound extends Schema.TaggedError<ChecklistItemNotFound>()(
  'ChecklistItemNotFound',
  { itemId: ChecklistItemId },
) {}

/** An own Checklist item's text is blank or too long; nothing is written. */
export class ChecklistTextInvalid extends Schema.TaggedError<ChecklistTextInvalid>()(
  'ChecklistTextInvalid',
  { maxLength: Schema.Int },
) {}

/** What ticking an item derived from the Schedule did, for the browser. */
export const TickChecklistItemOutcome = Schema.TaggedUnion({
  Ticked: {},
  ScheduleChanged: ScheduleChanged.fields,
  ChecklistItemNotFound: ChecklistItemNotFound.fields,
})

export type TickChecklistItemOutcome = typeof TickChecklistItemOutcome.Type

/** What ticking one of Phillip's own items did, for the browser. */
export const TickOwnChecklistItemOutcome = Schema.TaggedUnion({
  Ticked: {},
  ChecklistItemNotFound: ChecklistItemNotFound.fields,
})

export type TickOwnChecklistItemOutcome =
  typeof TickOwnChecklistItemOutcome.Type

/** What adding one of Phillip's own items did, for the browser. */
export const AddOwnChecklistItemOutcome = Schema.TaggedUnion({
  Added: OwnChecklistItemAdded.fields,
  ChecklistTextInvalid: ChecklistTextInvalid.fields,
})

export type AddOwnChecklistItemOutcome = typeof AddOwnChecklistItemOutcome.Type

/** What removing one of Phillip's own items did, for the browser. */
export const RemoveOwnChecklistItemOutcome = Schema.TaggedUnion({
  Removed: {},
})

export type RemoveOwnChecklistItemOutcome =
  typeof RemoveOwnChecklistItemOutcome.Type
