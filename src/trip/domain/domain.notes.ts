import { Schema } from 'effect'

import { IsoDate } from '@/trip/domain/domain.itinerary'
import { CopyId, DayNotFound } from '@/trip/domain/domain.schedule'
import { StayNotFound } from '@/trip/domain/domain.stays'
import { operationOutcome } from '@/trip/domain/domain.writes'

/**
 * Write the Day note on a Day, as a whole value: an
 * empty note removes it. The last write wins.
 */
export const WriteDayNote = Schema.Struct({
  date: IsoDate,
  note: Schema.String,
})

export type WriteDayNote = typeof WriteDayNote.Type

/** A note longer than the Trip service accepts; nothing is written. */
export class NoteTooLong extends Schema.TaggedError<NoteTooLong>()(
  'NoteTooLong',
  { maxLength: Schema.Int },
) {}

export const WriteDayNoteOutcome = operationOutcome('Written', {}, [
  DayNotFound,
  NoteTooLong,
])

export type WriteDayNoteOutcome = typeof WriteDayNoteOutcome.Type

/**
 * Write the Stay note on a Stay, as a whole value: an
 * empty note removes it. The last write wins.
 */
export const WriteStayNote = Schema.Struct({
  stayId: CopyId,
  note: Schema.String,
})

export type WriteStayNote = typeof WriteStayNote.Type

export const WriteStayNoteOutcome = operationOutcome('Written', {}, [
  StayNotFound,
  NoteTooLong,
])

export type WriteStayNoteOutcome = typeof WriteStayNoteOutcome.Type

/**
 * Write the Trip note, as a whole value: an empty note removes it. It belongs
 * to the Trip, not a Schedule, so it names none. The last write wins.
 */
export const WriteTripNote = Schema.Struct({ note: Schema.String })

export type WriteTripNote = typeof WriteTripNote.Type

export const WriteTripNoteOutcome = operationOutcome('Written', {}, [
  NoteTooLong,
])

export type WriteTripNoteOutcome = typeof WriteTripNoteOutcome.Type
