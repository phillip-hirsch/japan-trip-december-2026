import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import { december, IsoDate, WriteDayNoteOutcome } from '@/trip/domain/domain'
import type { ScheduleId } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { noteMaxLength } from '@/trip/domain/limits'
import { operation, storage, tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { runTripWrite } from '@/trip/trip-store/trip-writes'

const trip = tripWith([option1, option2])

const choose = (
  optionNumber: number,
  n: number,
  replacing: ScheduleId | null,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

const dayNote = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).day.note,
  )

describe('runTripWrite', () => {
  it.effect('answers a written Day note with Written', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const outcome = yield* runTripWrite('writeDayNote', {
        scheduleId,
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
    'answers a write to an archived Schedule with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        yield* choose(2, 2, archived)

        const outcome = yield* runTripWrite('writeDayNote', {
          scheduleId: archived,
          date: december(14),
          note: 'Written on an old screen.',
        })

        assert.deepStrictEqual(
          outcome,
          WriteDayNoteOutcome.cases.ScheduleChanged.make({}),
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'answers a Day the Schedule lacks with DayNotFound and its date',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)

        const outcome = yield* runTripWrite('writeDayNote', {
          scheduleId,
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
      const scheduleId = yield* choose(1, 1, null)

      const outcome = yield* runTripWrite('writeDayNote', {
        scheduleId,
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
