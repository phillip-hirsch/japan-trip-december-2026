import { DateTime, Effect, Option, Schema, Struct } from 'effect'

import { tripTimeZone } from '@/trip/domain/calendar'
import {
  AnchorWarning,
  anchorFields,
  Coordinates,
  DayDetail,
  DayTripDetail,
  IsoDate,
  IsoInstant,
  ItineraryMap,
  ItineraryNotFound,
  ItinerarySummary,
  MoveDetail,
  OptionNumber,
  StayDetail,
  StaySummary,
  VerifyClaimDetail,
} from '@/trip/domain/domain.itinerary'
import {
  OperationId,
  ScheduleChanged,
  operationOutcome,
} from '@/trip/domain/domain.writes'

/** The id of something copied into a Schedule, fresh in each Schedule. */
export const CopyId = Schema.String

export const ScheduleId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('ScheduleId'),
)

export type ScheduleId = typeof ScheduleId.Type

/** An archived Schedule is read-only; at most one is current. */
export const ScheduleStatus = Schema.Literals(['current', 'archived'])

export type ScheduleStatus = typeof ScheduleStatus.Type

export const ScheduleAnchor = Schema.TaggedUnion({
  Arrival: { id: CopyId, ...anchorFields.Arrival },
  ShigeharuVisit: { id: CopyId, ...anchorFields.ShigeharuVisit },
  Birthday: { id: CopyId, ...anchorFields.Birthday },
  Departure: { id: CopyId, ...anchorFields.Departure },
})

export type ScheduleAnchor = typeof ScheduleAnchor.Type

/**
 * Where a place is on the map: its coordinates, and the Google Maps link
 * Phillip set it from, absent for one dropped by hand without a link.
 */
export const Pin = Schema.Struct({
  coordinates: Coordinates,
  link: Schema.optionalKey(Schema.String),
})

export type Pin = typeof Pin.Type

export const HotelDetails = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  address: Schema.optionalKey(Schema.String),
  confirmationNumber: Schema.optionalKey(Schema.String),
})

export type HotelDetails = typeof HotelDetails.Type

export const Hotel = Schema.TaggedUnion({
  NotRecorded: {},
  Recorded: {
    ...HotelDetails.fields,
    pin: Schema.optionalKey(Pin),
  },
})

export type Hotel = typeof Hotel.Type

/**
 * The Stay edits a Stay offers, which are the ones the Hard rules accept.
 * Changing its Base is always offered, so it isn't listed.
 */
export const StayEditOffers = Schema.Struct({
  /** The dates it can split on, in Trip order. */
  splitDates: Schema.Array(IsoDate),
  /** The next Stay, while the two can merge. */
  mergeWith: Schema.optionalKey(CopyId),
  /**
   * The next Stay and the dates the Stay boundary between them can move to,
   * in Trip order. Absent for the last Stay.
   */
  boundary: Schema.optionalKey(
    Schema.Struct({ next: CopyId, checkOuts: Schema.Array(IsoDate) }),
  ),
})

export type StayEditOffers = typeof StayEditOffers.Type

export const ScheduleStayDetail = Schema.Struct({
  id: CopyId,
  ...StayDetail.fields,
  note: Schema.optionalKey(Schema.String),
  hotel: Hotel,
  /**
   * Empty when decoding a Stay edit recorded before the Schedule had
   * Offered Stay edits. A retry of that edit returns the recorded result.
   */
  offers: StayEditOffers.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ splitDates: [] })),
  ),
})

export type ScheduleStayDetail = typeof ScheduleStayDetail.Type

export const ScheduleMoveDetail = Schema.Struct({
  id: CopyId,
  ...MoveDetail.fields,
})

export type ScheduleMoveDetail = typeof ScheduleMoveDetail.Type

export const ActivityId = Schema.String

export const TokyoDateTime = Schema.String.check(
  Schema.makeFilter((dateTime: string) =>
    Option.exists(
      DateTime.makeZonedFromString(dateTime),
      (zoned) =>
        DateTime.zoneToString(zoned.zone) === tripTimeZone &&
        DateTime.formatIsoZoned(zoned) === dateTime,
    ),
  ),
).pipe(Schema.brand('TokyoDateTime'))

export type TokyoDateTime = typeof TokyoDateTime.Type

export const Activity = Schema.Struct({
  id: ActivityId,
  title: Schema.String,
  time: Schema.optionalKey(TokyoDateTime),
  note: Schema.optionalKey(Schema.String),
  pin: Schema.optionalKey(Pin),
})

export type Activity = typeof Activity.Type

export const ScheduleDayDetail = Schema.Struct({
  ...DayDetail.fields,
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

export const ScheduleRecord = Schema.Struct({
  id: ScheduleId,
  status: ScheduleStatus,
  sourceOptionNumber: OptionNumber,
  /** The content version of the Itinerary when it was chosen. */
  sourceContentVersion: Schema.String,
  chosenAt: IsoInstant,
  archivedAt: Schema.NullOr(IsoInstant),
  birthdayOutline: Schema.String,
})

export type ScheduleRecord = typeof ScheduleRecord.Type

export const ScheduleSummary = Schema.Struct(
  Struct.pick(ScheduleRecord.fields, ['id', 'sourceOptionNumber']),
)

export type ScheduleSummary = typeof ScheduleSummary.Type

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
   * In Trip order. The Trip service derives them from the Stays and Moves on
   * every read, so a warning stays until the Schedule stops breaking its rule.
   */
  anchorWarnings: Schema.Array(AnchorWarning),
})

export type ScheduleDetail = typeof ScheduleDetail.Type

export const MapHotel = Schema.Struct({
  stayId: CopyId,
  ...StaySummary.fields,
  ...HotelDetails.fields,
  pin: Pin,
})

export type MapHotel = typeof MapHotel.Type

export const MapActivity = Schema.Struct({
  ...Struct.pick(Activity.fields, ['id', 'title', 'time']),
  date: IsoDate,
  pin: Pin,
})

export type MapActivity = typeof MapActivity.Type

/**
 * The current Schedule on its map: drawn as an Itinerary's map is, from the
 * Schedule's own Stays and Moves, with every pinned hotel and Activity.
 */
export const ScheduleMap = Schema.Struct({
  ...ItineraryMap.fields,
  /** Each pinned hotel, in Trip order. */
  hotels: Schema.Array(MapHotel),
  /** Each pinned Activity, by Day, in Phillip's order. */
  activities: Schema.Array(MapActivity),
})

export type ScheduleMap = typeof ScheduleMap.Type

export const ArchivedScheduleSummary = Schema.Struct({
  ...Struct.pick(ScheduleRecord.fields, [
    'id',
    'sourceOptionNumber',
    'chosenAt',
  ]),
  archivedAt: IsoInstant,
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

/** The date is not a Day of the Trip, December 6 through December 20. */
export class DayNotFound extends Schema.TaggedError<DayNotFound>()(
  'DayNotFound',
  { date: IsoDate },
) {}

const homeFields = {
  /**
   * The moment of the Clock the state was read at, as an ISO 8601 UTC
   * string. The browser counts from it to the next Tokyo midnight.
   */
  readAt: Schema.String,
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
    date: IsoDate,
    /** Today: that Day's page, null until a Schedule exists. */
    today: Schema.NullOr(DayPage),
  },
  AfterTrip: {
    ...homeFields,
    schedule: Schema.NullOr(ScheduleDetail),
  },
})

export type HomeState = typeof HomeState.Type

/** A Day's page, null until a Schedule exists. */
export const DayOutcome = operationOutcome(
  'Day',
  { page: Schema.NullOr(DayPage) },
  [DayNotFound],
)

export type DayOutcome = typeof DayOutcome.Type

export const ScheduleOutcome = operationOutcome(
  'Schedule',
  { schedule: ScheduleDetail },
  [ScheduleNotFound],
)

export type ScheduleOutcome = typeof ScheduleOutcome.Type

export const ChooseOutcome = operationOutcome('Chosen', ScheduleChosen.fields, [
  ItineraryNotFound,
  ScheduleChanged,
])

export type ChooseOutcome = typeof ChooseOutcome.Type

export const RestoreOutcome = operationOutcome(
  'Restored',
  ScheduleRestored.fields,
  [ScheduleNotFound, ScheduleChanged],
)

export type RestoreOutcome = typeof RestoreOutcome.Type
