import { Predicate } from 'effect'

import type { ChecklistItem, IsoDate, PinTarget } from '@/trip/domain/domain'

const storageKey = (target: string) => `draft:${target}`

export interface Draft<V> {
  readonly value: V
  readonly scheduleId: string | null
  readonly writeId: string
  /** The operation it was last sent under, for the Schedule it is marked with. */
  readonly operationId: string | undefined
}

// Storage can be unavailable or full; the field still holds the value then.
export const readDraft = <V>(
  target: string,
  isValue: (value: unknown) => value is V,
): Draft<V> | undefined => {
  try {
    const stored = localStorage.getItem(storageKey(target))

    if (stored === null) return undefined

    const draft: unknown = JSON.parse(stored)

    return Predicate.isObject(draft) &&
      isValue(draft.value) &&
      (Predicate.isString(draft.scheduleId) ||
        Predicate.isNull(draft.scheduleId)) &&
      Predicate.isString(draft.id) &&
      (Predicate.isString(draft.operationId) ||
        Predicate.isUndefined(draft.operationId))
      ? {
          value: draft.value,
          scheduleId: draft.scheduleId,
          writeId: draft.id,
          operationId: draft.operationId,
        }
      : undefined
  } catch {
    return undefined
  }
}

export const writeDraft = <V>(
  target: string,
  value: V,
  scheduleId: string | null,
  operationId: string | undefined,
) => {
  const writeId = crypto.randomUUID()

  try {
    localStorage.setItem(
      storageKey(target),
      JSON.stringify({ value, scheduleId, id: writeId, operationId }),
    )
  } catch {
    // Nothing else can keep it; the field still holds it.
  }

  return writeId
}

export const clearDraft = (target: string) => {
  try {
    localStorage.removeItem(storageKey(target))
  } catch {
    // A draft left behind is restored and compared with the saved value.
  }
}

export const dayNoteTarget = (date: IsoDate) => `day-note:${date}`

/**
 * The draft target of the Stay note on a Stay, by its id. Not by its dates:
 * a Stay keeps its id when they change, and another Schedule's Stay checking
 * in on the same date may be somewhere else entirely. Its id is fresh in each
 * Schedule, so a draft refused because the Schedule changed is kept, and
 * reopens only if its own Schedule is restored.
 */
export const stayNoteTarget = (stayId: string) => `stay-note:${stayId}`

export const hotelDetailsTarget = (stayId: string) => `hotel-details:${stayId}`

export const stayBoundaryTarget = (stayId: string) => `stay-boundary:${stayId}`

export const stayBaseTarget = (stayId: string) => `stay-base:${stayId}`

export const splitMergeTarget = (stayId: string) => `split-merge:${stayId}`

export const tripNoteTarget = 'trip-note'

export const newActivityTarget = (date: IsoDate) => `activity:new:${date}`

export const activityTarget = (activityId: string) => `activity:${activityId}`

/** The moves of the Activities on a Day. */
export const activityMovesTarget = (date: IsoDate) => `activity-moves:${date}`

/** The removals of the Activities on a Day. */
export const activityRemovalsTarget = (date: IsoDate) =>
  `activity-removals:${date}`

export const pinTarget = (target: PinTarget) =>
  'activityId' in target
    ? `pin:activity:${target.activityId}`
    : `pin:hotel:${target.stayId}`

export const newChecklistItemTarget = 'checklist-item:new'

export const tickTarget = ({ _tag, id }: ChecklistItem) => `tick:${_tag}:${id}`

export const checklistItemRemovalTarget = (itemId: string) =>
  `checklist-item-removal:${itemId}`
