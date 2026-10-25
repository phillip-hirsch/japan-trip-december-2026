import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, IsoDate, WriteDayNoteOutcome } from '@/trip/domain/domain'
import { noteMaxLength } from '@/trip/domain/limits'
import { storage, testTrip } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

const trip = testTrip

const dayNote = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => page.day.note,
  )

describe('runTripOperation', () => {
  it.effect('answers a written Day note with Written', () =>
    Effect.gen(function* () {
      const outcome = yield* runTripOperation('writeDayNote', {
        date: december(14),
        note: 'Book the onsen.',
      })

      assert.deepStrictEqual(
        { outcome, note: yield* dayNote(december(14)) },
        {
          outcome: WriteDayNoteOutcome.cases.Written.make({}),
          note: 'Book the onsen.',
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'answers a Day the Schedule lacks with DayNotFound and its date',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('writeDayNote', {
          date: IsoDate.make('2026-12-21'),
          note: 'After the Trip.',
        })

        assert.deepStrictEqual(
          outcome,
          WriteDayNoteOutcome.cases.DayNotFound.make({
            date: IsoDate.make('2026-12-21'),
          }),
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('answers a Day note too long with NoteTooLong and the limit', () =>
    Effect.gen(function* () {
      const outcome = yield* runTripOperation('writeDayNote', {
        date: december(14),
        note: 'あ'.repeat(noteMaxLength + 1),
      })

      assert.deepStrictEqual(
        { outcome, note: yield* dayNote(december(14)) },
        {
          outcome: WriteDayNoteOutcome.cases.NoteTooLong.make({
            maxLength: noteMaxLength,
          }),
          note: undefined,
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})
