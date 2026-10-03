import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Predicate } from 'effect'

import { december, IsoDate } from '@/trip/domain'
import type { ScheduleId } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { operation, setTime, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

const trip = tripWith([option1, option2])

/** Chooses an Itinerary, replacing the Schedule named, if any. */
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

const writeDayNote = (scheduleId: ScheduleId, date: IsoDate, note: string) =>
  Trip.use((trip) => trip.writeDayNote({ scheduleId, date, note }))

/** The Day note on a Day of the current Schedule, if it has one. */
const dayNote = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).day.note,
  )

describe('Trip.writeDayNote', () => {
  it.effect('leaves the last of two successive writes', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      yield* writeDayNote(scheduleId, december(14), 'Book the onsen.')
      yield* writeDayNote(scheduleId, december(14), 'Onsen booked for 18:00.')
      assert.strictEqual(
        yield* dayNote(december(14)),
        'Onsen booked for 18:00.',
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a write naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const stale = yield* choose(1, 1, null)
        // Another device chooses again, so this screen's Schedule is stale.
        const current = yield* choose(2, 2, stale)
        yield* writeDayNote(current, december(14), 'Pack for the Alps.')

        const error = yield* Effect.flip(
          writeDayNote(stale, december(14), 'Written on an old screen.'),
        )

        assert.deepStrictEqual(
          { tag: error._tag, note: yield* dayNote(december(14)) },
          { tag: 'ScheduleChanged', note: 'Pack for the Alps.' },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'rejects a write to an archived Schedule, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        yield* writeDayNote(archived, december(14), 'Book the onsen.')
        yield* choose(2, 2, archived)

        const error = yield* Effect.flip(
          writeDayNote(archived, december(14), 'Rewritten after archiving.'),
        )

        const schedule = yield* Trip.use((trip) => trip.schedule(archived))
        assert.deepStrictEqual(
          {
            tag: error._tag,
            status: schedule.status,
            note: schedule.days.find((day) => day.date === december(14))?.note,
          },
          {
            tag: 'ScheduleChanged',
            status: 'archived',
            note: 'Book the onsen.',
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with DayNotFound for a Day the Schedule lacks', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const error = yield* Effect.flip(
        writeDayNote(scheduleId, IsoDate.make('2026-12-21'), 'After the Trip.'),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          date: Predicate.isTagged('DayNotFound')(error)
            ? error.date
            : undefined,
        },
        { tag: 'DayNotFound', date: '2026-12-21' },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('accepts 10,000 characters and rejects one more', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const longest = 'あ'.repeat(10_000)
      yield* writeDayNote(scheduleId, december(14), longest)

      const error = yield* Effect.flip(
        writeDayNote(scheduleId, december(14), `${longest}!`),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          maxLength: Predicate.isTagged('DayNoteTooLong')(error)
            ? error.maxLength
            : 0,
          kept: (yield* dayNote(december(14))) === longest,
        },
        { tag: 'DayNoteTooLong', maxLength: 10_000, kept: true },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('removes the Day note when written empty', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      yield* writeDayNote(scheduleId, december(14), 'Book the onsen.')
      yield* writeDayNote(scheduleId, december(14), '')
      assert.isUndefined(yield* dayNote(december(14)))
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('shows the Day note on Today on Home for that date', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      yield* writeDayNote(scheduleId, december(14), 'Book the onsen.')
      yield* setTime('2026-12-14T01:00:00Z')
      const home = yield* Trip.use((trip) => trip.home)
      assert.deepStrictEqual(
        Predicate.isTagged('DuringTrip')(home) && home.today
          ? { scheduleId: home.today.scheduleId, note: home.today.day.note }
          : undefined,
        { scheduleId, note: 'Book the onsen.' },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('leaves Day notes behind when choosing again', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      yield* writeDayNote(first, december(14), 'Book the onsen.')
      yield* choose(1, 2, first)
      assert.isUndefined(yield* dayNote(december(14)))
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('brings Day notes back when restoring their Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      yield* writeDayNote(first, december(14), 'Book the onsen.')
      const second = yield* choose(2, 2, first)
      yield* Trip.use((trip) =>
        trip.restore({
          operationId: operation(3),
          scheduleId: first,
          replacing: second,
        }),
      )
      assert.strictEqual(yield* dayNote(december(14)), 'Book the onsen.')
    }).pipe(Effect.provide([trip, storage])),
  )
})
