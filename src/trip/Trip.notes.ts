import { Effect } from 'effect'

import { DayNotFound } from '@/trip/domain'
import type { WriteDayNote, WriteStayNote, WriteTripNote } from '@/trip/domain'
import { scheduleStore } from '@/trip/schedule-store'
import {
  requireCurrent,
  requireNoteLength,
  requireStay,
} from '@/trip/Trip.guards'

const writeDayNote = Effect.fn('Trip.writeDayNote')(
  function* ({ scheduleId, date, note }: WriteDayNote) {
    yield* requireNoteLength(note)
    const store = yield* scheduleStore
    yield* store.transaction(
      Effect.gen(function* () {
        yield* requireCurrent(store, scheduleId)

        if (!(yield* store.hasDay(scheduleId, date))) {
          return yield* new DayNotFound({ date })
        }

        yield* store.writeDayNote(scheduleId, date, note)
      }),
    )
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

const writeStayNote = Effect.fn('Trip.writeStayNote')(
  function* ({ scheduleId, stayId, note }: WriteStayNote) {
    yield* requireNoteLength(note)
    const store = yield* scheduleStore
    yield* store.transaction(
      Effect.gen(function* () {
        yield* requireStay(store, scheduleId, stayId)
        yield* store.writeStayNote(scheduleId, stayId, note)
      }),
    )
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

const writeTripNote = Effect.fn('Trip.writeTripNote')(
  function* ({ note }: WriteTripNote) {
    yield* requireNoteLength(note)
    const store = yield* scheduleStore
    yield* store.writeTripNote(note)
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

/** The Day, Stay and Trip note writes. */
export const noteMethods = Effect.succeed({
  writeDayNote,
  writeStayNote,
  writeTripNote,
})
