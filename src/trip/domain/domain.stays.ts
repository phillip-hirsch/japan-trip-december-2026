import { Schema } from 'effect'

import { IsoDate, stayDateRules } from '@/trip/domain/domain.itinerary'
import {
  CopyId,
  HotelDetails,
  ScheduleDetail,
} from '@/trip/domain/domain.schedule'
import { OperationId, operationOutcome } from '@/trip/domain/domain.writes'

export class StayNotFound extends Schema.TaggedError<StayNotFound>()(
  'StayNotFound',
  { stayId: CopyId },
) {}

/**
 * Write the Hotel details on a Stay, as a whole value:
 * each field is trimmed, a blank one is removed, and all blank removes them,
 * so the Stay's hotel is not recorded again. The last write wins.
 */
export const WriteHotelDetails = Schema.Struct({
  stayId: CopyId,
  details: HotelDetails,
})

export type WriteHotelDetails = typeof WriteHotelDetails.Type

export class HotelDetailTooLong extends Schema.TaggedError<HotelDetailTooLong>()(
  'HotelDetailTooLong',
  { maxLength: Schema.Int },
) {}

/**
 * The Hard rule that refuses a Stay edit, which then changes nothing. It is a
 * rule on Stay dates, or a reason the edit can't apply. A merge needs two
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

/** The Hard rule named refused a Stay edit, and the Trip service wrote nothing. */
export class HardRuleBroken extends Schema.TaggedError<HardRuleBroken>()(
  'HardRuleBroken',
  { rule: HardRule },
) {}

export const StaysEdited = Schema.Struct({ schedule: ScheduleDetail })

export type StaysEdited = typeof StaysEdited.Type

export const StayEditOutcome = operationOutcome('Edited', StaysEdited.fields, [
  StayNotFound,
  HardRuleBroken,
])

export type StayEditOutcome = typeof StayEditOutcome.Type

/**
 * Split a Stay at a date after its check-in and before
 * its check-out. The Stay keeps the nights before the date. A new Stay in the
 * same Base takes the rest, joined to it by a new local Move on the date. It
 * creates both, so a retry with the same operation id returns the first
 * result.
 */
export const SplitStay = Schema.Struct({
  operationId: OperationId,
  stayId: CopyId,
  date: IsoDate,
})

export type SplitStay = typeof SplitStay.Type

/**
 * Merge two adjacent Stays in one Base, given in either
 * order. The earlier Stay takes the later one's nights, and the Move between
 * them is removed. A retry with the same operation id returns the first
 * result, instead of finding the later Stay gone.
 */
export const MergeStays = Schema.Struct({
  operationId: OperationId,
  stayIds: Schema.Tuple([CopyId, CopyId]),
})

export type MergeStays = typeof MergeStays.Type

/**
 * Move the date a Stay checks out. The next Stay's
 * check-in and the Move between them move to the same date. Setting a date
 * twice changes nothing more, so it carries no operation id.
 */
export const MoveStayBoundary = Schema.Struct({
  stayId: CopyId,
  checkOut: IsoDate,
})

export type MoveStayBoundary = typeof MoveStayBoundary.Type

/**
 * Change the Base of a Stay to the place with the id
 * given. The place is any string, so one outside the catalogue reaches the
 * Trip service, which refuses it with a Hard rule. Setting a Base is
 * idempotent, so it carries no operation id.
 */
export const ChangeStayBase = Schema.Struct({
  stayId: CopyId,
  place: Schema.String,
})

export type ChangeStayBase = typeof ChangeStayBase.Type

export const WriteHotelDetailsOutcome = operationOutcome('Written', {}, [
  StayNotFound,
  HotelDetailTooLong,
])

export type WriteHotelDetailsOutcome = typeof WriteHotelDetailsOutcome.Type
