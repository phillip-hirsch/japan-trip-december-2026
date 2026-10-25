import { Schema } from 'effect'

import {
  IsoDate,
  Place,
  StaySummary,
  VerifyClaimAttachment,
} from '@/trip/domain/domain.itinerary'
import { OperationId, operationOutcome } from '@/trip/domain/domain.writes'

/**
 * The id of a Checklist item: for one derived from the Schedule, the id of
 * what it refers to, such as a Stay; for one of Phillip's own, its own.
 */
export const ChecklistItemId = Schema.String

export const ChecklistMove = Schema.Struct({
  date: IsoDate,
  from: Place,
  to: Place,
})

export type ChecklistMove = typeof ChecklistMove.Type

const checklistItemFields = { id: ChecklistItemId, ticked: Schema.Boolean }

/**
 * One thing to book or confirm. All but Phillip's own are derived from the
 * Schedule each time it's read, and ticked only while what they refer to
 * still exists in it. A reminder date is only shown: nothing is sent.
 */
export const ChecklistItem = Schema.TaggedUnion({
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
  ConfirmShigeharu: { ...checklistItemFields, date: IsoDate },
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
  items: Schema.Array(ChecklistItem),
})

export type Checklist = typeof Checklist.Type

/**
 * Set the tick on an item derived from the Schedule, to true or false, never
 * toggled. It is kept with the Schedule, by what the item refers to.
 */
export const TickChecklistItem = Schema.Struct({
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

export class ChecklistItemNotFound extends Schema.TaggedError<ChecklistItemNotFound>()(
  'ChecklistItemNotFound',
  { itemId: ChecklistItemId },
) {}

/** An own Checklist item's text is blank or too long; nothing is written. */
export class ChecklistTextInvalid extends Schema.TaggedError<ChecklistTextInvalid>()(
  'ChecklistTextInvalid',
  { maxLength: Schema.Int },
) {}

export const TickChecklistItemOutcome = operationOutcome('Ticked', {}, [
  ChecklistItemNotFound,
])

export type TickChecklistItemOutcome = typeof TickChecklistItemOutcome.Type

export const TickOwnChecklistItemOutcome = operationOutcome('Ticked', {}, [
  ChecklistItemNotFound,
])

export type TickOwnChecklistItemOutcome =
  typeof TickOwnChecklistItemOutcome.Type

export const AddOwnChecklistItemOutcome = operationOutcome(
  'Added',
  OwnChecklistItemAdded.fields,
  [ChecklistTextInvalid],
)

export type AddOwnChecklistItemOutcome = typeof AddOwnChecklistItemOutcome.Type

export const RemoveOwnChecklistItemOutcome = operationOutcome('Removed', {}, [])

export type RemoveOwnChecklistItemOutcome =
  typeof RemoveOwnChecklistItemOutcome.Type
