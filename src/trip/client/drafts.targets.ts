import type { ChecklistItem, IsoDate, PinTarget } from '@/trip/domain/domain'

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
