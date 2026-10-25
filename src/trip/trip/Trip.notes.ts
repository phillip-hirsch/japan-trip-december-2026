import { Effect } from 'effect'

import { DayNotFound } from '@/trip/domain/domain'
import type {
  WriteDayNote,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain/domain'
import {
  requireNoteLength,
  requireStay,
  scheduleWrite,
  tripWrite,
} from '@/trip/trip/Trip.guards'

const writeDayNote = Effect.fn('Trip.writeDayNote')(function* ({
  date,
  note,
}: WriteDayNote) {
  yield* requireNoteLength(note)
  yield* scheduleWrite({}, (store, scheduleId) =>
    Effect.gen(function* () {
      if (!(yield* store.hasDay(scheduleId, date))) {
        return yield* new DayNotFound({ date })
      }

      yield* store.writeDayNote(scheduleId, date, note)
    }),
  )
})

const writeStayNote = Effect.fn('Trip.writeStayNote')(function* ({
  stayId,
  note,
}: WriteStayNote) {
  yield* requireNoteLength(note)
  yield* scheduleWrite({}, (store, scheduleId) =>
    Effect.andThen(
      requireStay(store, scheduleId, stayId),
      store.writeStayNote(scheduleId, stayId, note),
    ),
  )
})

const writeTripNote = Effect.fn('Trip.writeTripNote')(function* ({
  note,
}: WriteTripNote) {
  yield* requireNoteLength(note)
  yield* tripWrite({}, (store) => store.writeTripNote(note))
})

/** The Day, Stay and Trip note writes. */
export const noteMethods = Effect.succeed({
  writeDayNote,
  writeStayNote,
  writeTripNote,
})
