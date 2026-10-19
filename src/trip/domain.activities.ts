import { Schema } from 'effect'

import { timeOfDayPattern } from '@/trip/calendar'
import { Coordinates, IsoDate } from '@/trip/domain.itinerary'
import { NoteTooLong } from '@/trip/domain.notes'
import {
  ActivityId,
  CopyId,
  DayNotFound,
  Pin,
  ScheduleId,
} from '@/trip/domain.schedule'
import { StayNotFound } from '@/trip/domain.stays'
import { OperationId, ScheduleChanged } from '@/trip/domain.writes'

export const TimeOfDay = Schema.String.check(
  Schema.isPattern(timeOfDayPattern),
).pipe(Schema.brand('TimeOfDay'))

export type TimeOfDay = typeof TimeOfDay.Type

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

export class ActivityNotFound extends Schema.TaggedError<ActivityNotFound>()(
  'ActivityNotFound',
  { activityId: ActivityId },
) {}

/** An Activity's title is blank or too long; nothing is written. */
export class ActivityTitleInvalid extends Schema.TaggedError<ActivityTitleInvalid>()(
  'ActivityTitleInvalid',
  { maxLength: Schema.Int },
) {}

export const AddActivityOutcome = Schema.TaggedUnion({
  Added: ActivityAdded.fields,
  ScheduleChanged: ScheduleChanged.fields,
  DayNotFound: DayNotFound.fields,
  ActivityTitleInvalid: ActivityTitleInvalid.fields,
  NoteTooLong: NoteTooLong.fields,
})

export type AddActivityOutcome = typeof AddActivityOutcome.Type

export const EditActivityOutcome = Schema.TaggedUnion({
  Edited: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
  ActivityTitleInvalid: ActivityTitleInvalid.fields,
  NoteTooLong: NoteTooLong.fields,
})

export type EditActivityOutcome = typeof EditActivityOutcome.Type

export const RemoveActivityOutcome = Schema.TaggedUnion({
  Removed: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
})

export type RemoveActivityOutcome = typeof RemoveActivityOutcome.Type

export const MoveActivityOutcome = Schema.TaggedUnion({
  Moved: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
})

export type MoveActivityOutcome = typeof MoveActivityOutcome.Type

export const ResolveLocationLink = Schema.Struct({ link: Schema.String })

export type ResolveLocationLink = typeof ResolveLocationLink.Type

/**
 * Why a location link was refused: it isn't an https Google Maps link, or is
 * too long; following it redirected off the https Google Maps hosts, or more
 * than five times; it took too long; or it couldn't be followed, such as a
 * short link that no longer exists.
 */
export const LocationLinkRefusal = Schema.Literals([
  'NotGoogleMaps',
  'TooLong',
  'LeftGoogleMaps',
  'TooManyRedirects',
  'TimedOut',
  'Unreachable',
])

export type LocationLinkRefusal = typeof LocationLinkRefusal.Type

export class LocationLinkRefused extends Schema.TaggedError<LocationLinkRefused>()(
  'LocationLinkRefused',
  { reason: LocationLinkRefusal },
) {}

/**
 * A Google Maps link that carries no coordinates, such as one naming a place
 * only. Phillip can drop the Pin by hand and keep the link.
 */
export class NoCoordinatesInLink extends Schema.TaggedError<NoCoordinatesInLink>()(
  'NoCoordinatesInLink',
  {},
) {}

export class CoordinatesOutsideJapan extends Schema.TaggedError<CoordinatesOutsideJapan>()(
  'CoordinatesOutsideJapan',
  { coordinates: Coordinates },
) {}

export const ResolveLocationLinkOutcome = Schema.TaggedUnion({
  Resolved: { coordinates: Coordinates },
  LocationLinkRefused: LocationLinkRefused.fields,
  NoCoordinatesInLink: NoCoordinatesInLink.fields,
  CoordinatesOutsideJapan: CoordinatesOutsideJapan.fields,
})

export type ResolveLocationLinkOutcome = typeof ResolveLocationLinkOutcome.Type

export const PinTarget = Schema.Union([
  Schema.Struct({ activityId: ActivityId }),
  Schema.Struct({ stayId: CopyId }),
])

export type PinTarget = typeof PinTarget.Type

/**
 * Set the Pin on an Activity or a Stay's hotel of the Schedule named, as a
 * whole value, once Phillip confirms it; no Pin removes it. The last write
 * wins.
 */
export const SetPin = Schema.Struct({
  scheduleId: ScheduleId,
  target: PinTarget,
  pin: Schema.optionalKey(Pin),
})

export type SetPin = typeof SetPin.Type

export const SetPinOutcome = Schema.TaggedUnion({
  Set: {},
  ScheduleChanged: ScheduleChanged.fields,
  ActivityNotFound: ActivityNotFound.fields,
  StayNotFound: StayNotFound.fields,
  LocationLinkRefused: LocationLinkRefused.fields,
  CoordinatesOutsideJapan: CoordinatesOutsideJapan.fields,
})

export type SetPinOutcome = typeof SetPinOutcome.Type
