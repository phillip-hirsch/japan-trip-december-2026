import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import {
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
} from '@/trip/domain/domain'
import { noteMaxLength } from '@/trip/domain/limits'
import {
  kyotoStayId,
  currentStays,
  storage,
  testTrip,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

const tripNote = Effect.map(
  Trip.use((trip) => trip.schedules),
  ({ tripNote }) => tripNote,
)

describe('runTripOperation for the Stay note', () => {
  it.effect('answers a written Stay note with Written', () =>
    Effect.gen(function* () {
      const stayId = yield* kyotoStayId

      const outcome = yield* runTripOperation('writeStayNote', {
        stayId,
        note: 'Ask about the late check-in.',
      })

      assert.deepStrictEqual(
        { outcome, note: (yield* currentStays)[1]?.note },
        {
          outcome: WriteStayNoteOutcome.cases.Written.make({}),
          note: 'Ask about the late check-in.',
        },
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'answers a Stay the Schedule lacks with StayNotFound and its id',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('writeStayNote', {
          stayId: 'no-such-stay',
          note: 'Nowhere.',
        })

        assert.deepStrictEqual(
          outcome,
          WriteStayNoteOutcome.cases.StayNotFound.make({
            stayId: 'no-such-stay',
          }),
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )
})

describe('runTripOperation for the Trip note', () => {
  it.effect('answers a written Trip note with Written', () =>
    Effect.gen(function* () {
      const outcome = yield* runTripOperation('writeTripNote', {
        note: 'Pack the rail pass.',
      })

      assert.deepStrictEqual(
        { outcome, note: yield* tripNote },
        {
          outcome: WriteTripNoteOutcome.cases.Written.make({}),
          note: 'Pack the rail pass.',
        },
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('answers a Trip note too long with NoteTooLong and the limit', () =>
    Effect.gen(function* () {
      const outcome = yield* runTripOperation('writeTripNote', {
        note: 'あ'.repeat(noteMaxLength + 1),
      })

      assert.deepStrictEqual(
        { outcome, note: yield* tripNote },
        {
          outcome: WriteTripNoteOutcome.cases.NoteTooLong.make({
            maxLength: noteMaxLength,
          }),
          note: undefined,
        },
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )
})
