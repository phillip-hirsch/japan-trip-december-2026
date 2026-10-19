import { Effect, Option } from 'effect'

import {
  ActivityTitleInvalid,
  ChecklistTextInvalid,
  NoteTooLong,
  ScheduleChanged,
  StayNotFound,
} from '@/trip/domain/domain'
import type { IsoInstant, ScheduleId } from '@/trip/domain/domain'
import {
  activityTitleMaxLength,
  checklistTextMaxLength,
  noteMaxLength,
} from '@/trip/domain/limits'
import type { ScheduleStore } from '@/trip/schedule-store/schedule-store'

export const requireCurrent = Effect.fnUntraced(function* (
  store: ScheduleStore,
  believedCurrent: ScheduleId | null,
) {
  const current = yield* store.currentRecord
  const currentId = Option.getOrNull(Option.map(current, ({ id }) => id))

  if (currentId !== believedCurrent) return yield* new ScheduleChanged()

  return current
})

export const requireStay = Effect.fnUntraced(function* (
  store: ScheduleStore,
  scheduleId: ScheduleId,
  stayId: string,
) {
  yield* requireCurrent(store, scheduleId)

  if (!(yield* store.hasStay(scheduleId, stayId))) {
    return yield* new StayNotFound({ stayId })
  }
})

export const archiveReplaced = Effect.fnUntraced(function* (
  store: ScheduleStore,
  replacing: ScheduleId | null,
  archivedAt: IsoInstant,
) {
  const current = yield* requireCurrent(store, replacing)

  if (Option.isSome(current)) {
    yield* store.archive(current.value.id, archivedAt)
  }
})

export const requireNoteLength = (note: string) =>
  note.length > noteMaxLength
    ? Effect.fail(new NoteTooLong({ maxLength: noteMaxLength }))
    : Effect.void

const requireText = <E>(
  text: string,
  maxLength: number,
  invalid: (maxLength: number) => E,
) => {
  const trimmed = text.trim()

  return trimmed === '' || trimmed.length > maxLength
    ? Effect.fail(invalid(maxLength))
    : Effect.succeed(trimmed)
}

export const requireChecklistText = (text: string) =>
  requireText(
    text,
    checklistTextMaxLength,
    (maxLength) => new ChecklistTextInvalid({ maxLength }),
  )

export const requireActivityTitle = (title: string) =>
  requireText(
    title,
    activityTitleMaxLength,
    (maxLength) => new ActivityTitleInvalid({ maxLength }),
  )
