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
  scheduleId,
  date,
  note,
}: WriteDayNote) {
  yield* requireNoteLength(note)
  yield* scheduleWrite({ naming: scheduleId }, (store) =>
    Effect.gen(function* () {
      if (!(yield* store.hasDay(scheduleId, date))) {
        return yield* new DayNotFound({ date })
      }

      yield* store.writeDayNote(scheduleId, date, note)
    }),
  )
})

const writeStayNote = Effect.fn('Trip.writeStayNote')(function* ({
  scheduleId,
  stayId,
  note,
}: WriteStayNote) {
  yield* requireNoteLength(note)
  yield* scheduleWrite({ naming: scheduleId }, (store) =>
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
