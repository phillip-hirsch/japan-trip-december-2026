import { assert, describe, it } from '@effect/vitest'
import { Effect, Predicate } from 'effect'

import { december, IsoDate } from '@/trip/domain/domain'
import type { ScheduleId } from '@/trip/domain/domain'
import {
  choose,
  currentSchedule,
  currentScheduleId,
  operation,
  restore,
  setTime,
  staysOf,
  storage,
  tripWithOptions1And2,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const writeDayNote = (scheduleId: ScheduleId, date: IsoDate, note: string) =>
  Trip.use((trip) => trip.writeDayNote({ scheduleId, date, note }))

const writeStayNote = (scheduleId: ScheduleId, stayId: string, note: string) =>
  Trip.use((trip) => trip.writeStayNote({ scheduleId, stayId, note }))

const writeTripNote = (note: string) =>
  Trip.use((trip) => trip.writeTripNote({ note }))

const firstStayId = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[0]?.id ?? '')

const firstStayNote = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[0]?.note)

const stayNotesOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) =>
    stays.flatMap(({ note }) => note ?? []),
  )

const tripNote = Effect.map(
  Trip.use((trip) => trip.schedules),
  ({ tripNote }) => tripNote,
)

const dayNote = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => page.day.note,
  )

describe('Trip.writeDayNote', () => {
  it.effect('leaves the last of two successive writes', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      yield* writeDayNote(scheduleId, december(14), 'Book the onsen.')
      yield* writeDayNote(scheduleId, december(14), 'Onsen booked for 18:00.')
      assert.strictEqual(
        yield* dayNote(december(14)),
        'Onsen booked for 18:00.',
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'refuses a write naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const stale = yield* currentScheduleId
        const current = yield* choose(2, 2, stale)
        yield* writeDayNote(current, december(14), 'Pack for the Alps.')

        const error = yield* Effect.flip(
          writeDayNote(stale, december(14), 'Written on an old screen.'),
        )

        assert.deepStrictEqual(
          { tag: error._tag, note: yield* dayNote(december(14)) },
          { tag: 'ScheduleChanged', note: 'Pack for the Alps.' },
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('fails with DayNotFound for a Day the Schedule lacks', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId

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
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('accepts 10,000 characters and rejects one more', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const longest = 'あ'.repeat(10_000)
      yield* writeDayNote(scheduleId, december(14), longest)

      const error = yield* Effect.flip(
        writeDayNote(scheduleId, december(14), `${longest}!`),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          maxLength: Predicate.isTagged('NoteTooLong')(error)
            ? error.maxLength
            : 0,
          kept: (yield* dayNote(december(14))) === longest,
        },
        { tag: 'NoteTooLong', maxLength: 10_000, kept: true },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('removes the Day note when written empty', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      yield* writeDayNote(scheduleId, december(14), 'Book the onsen.')
      yield* writeDayNote(scheduleId, december(14), '')
      assert.isUndefined(yield* dayNote(december(14)))
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('shows the Day note on Today on Home for that date', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      yield* writeDayNote(scheduleId, december(14), 'Book the onsen.')
      yield* setTime('2026-12-14T01:00:00Z')
      const home = yield* Trip.use((trip) => trip.home)
      assert.deepStrictEqual(
        Predicate.isTagged('DuringTrip')(home)
          ? { scheduleId: home.today.scheduleId, note: home.today.day.note }
          : undefined,
        { scheduleId, note: 'Book the onsen.' },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('leaves Day notes behind when choosing again', () =>
    Effect.gen(function* () {
      const first = yield* currentScheduleId
      yield* writeDayNote(first, december(14), 'Book the onsen.')
      yield* choose(1, 2, first)
      assert.isUndefined(yield* dayNote(december(14)))
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('brings Day notes back when restoring their Schedule', () =>
    Effect.gen(function* () {
      const first = yield* currentScheduleId
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
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})

describe('Trip.writeStayNote', () => {
  it.effect('leaves the last of two successive writes', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* firstStayId(scheduleId)
      yield* writeStayNote(scheduleId, stayId, 'Asakusa is quiet at night.')
      yield* writeStayNote(scheduleId, stayId, 'Try the kissaten by Exit 3.')
      assert.strictEqual(
        yield* firstStayNote(scheduleId),
        'Try the kissaten by Exit 3.',
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('fails with StayNotFound for a Stay the Schedule lacks', () =>
    Effect.gen(function* () {
      const first = yield* currentScheduleId
      const goneStayId = yield* firstStayId(first)
      const current = yield* choose(1, 2, first)

      const error = yield* Effect.flip(
        writeStayNote(current, goneStayId, 'For a Stay no longer shown.'),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          stayId: Predicate.isTagged('StayNotFound')(error)
            ? error.stayId
            : undefined,
          notes: yield* stayNotesOf(current),
        },
        { tag: 'StayNotFound', stayId: goneStayId, notes: [] },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('accepts 10,000 characters and rejects one more', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* firstStayId(scheduleId)
      const longest = 'あ'.repeat(10_000)
      yield* writeStayNote(scheduleId, stayId, longest)

      const error = yield* Effect.flip(
        writeStayNote(scheduleId, stayId, `${longest}!`),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          maxLength: Predicate.isTagged('NoteTooLong')(error)
            ? error.maxLength
            : 0,
          kept: (yield* firstStayNote(scheduleId)) === longest,
        },
        { tag: 'NoteTooLong', maxLength: 10_000, kept: true },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('removes the Stay note when written empty', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* firstStayId(scheduleId)
      yield* writeStayNote(scheduleId, stayId, 'Asakusa is quiet at night.')
      yield* writeStayNote(scheduleId, stayId, '')
      assert.isUndefined(yield* firstStayNote(scheduleId))
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'keeps Stay notes with their archived Schedule, apart from the fresh one, until restored',
    () =>
      Effect.gen(function* () {
        const first = yield* currentScheduleId
        const stayId = yield* firstStayId(first)
        yield* writeStayNote(first, stayId, 'Asakusa is quiet at night.')
        const second = yield* choose(1, 2, first)
        const whileArchived = yield* firstStayNote(first)
        const fresh = yield* stayNotesOf(second)
        yield* restore(first, 3, second)

        const current = yield* currentSchedule

        assert.deepStrictEqual(
          {
            whileArchived,
            fresh,
            restored: {
              scheduleId: current.id,
              note: current.stays[0]?.note,
            },
          },
          {
            whileArchived: 'Asakusa is quiet at night.',
            fresh: [],
            restored: { scheduleId: first, note: 'Asakusa is quiet at night.' },
          },
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})

describe('Trip.writeTripNote', () => {
  it.effect('leaves the last of two successive writes', () =>
    Effect.gen(function* () {
      yield* writeTripNote('Bring a coin purse.')
      yield* writeTripNote('Bring a coin purse and the Suica.')
      assert.strictEqual(yield* tripNote, 'Bring a coin purse and the Suica.')
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('has no Trip note until Phillip writes one', () =>
    Effect.gen(function* () {
      assert.isUndefined(yield* tripNote)
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('removes the Trip note when written empty', () =>
    Effect.gen(function* () {
      yield* writeTripNote('Bring a coin purse.')
      yield* writeTripNote('')
      assert.isUndefined(yield* tripNote)
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('accepts 10,000 characters and rejects one more', () =>
    Effect.gen(function* () {
      const longest = 'あ'.repeat(10_000)
      yield* writeTripNote(longest)
      const error = yield* Effect.flip(writeTripNote(`${longest}!`))

      assert.deepStrictEqual(
        {
          tag: error._tag,
          maxLength: error.maxLength,
          kept: (yield* tripNote) === longest,
        },
        { tag: 'NoteTooLong', maxLength: 10_000, kept: true },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('carries the Trip note over on choosing again and restoring', () =>
    Effect.gen(function* () {
      const first = yield* currentScheduleId
      yield* writeTripNote('Bring a coin purse.')
      const second = yield* choose(2, 2, first)
      const afterChoosing = yield* tripNote
      yield* writeTripNote('Bring a coin purse and the Suica.')
      yield* restore(first, 3, second)

      assert.deepStrictEqual(
        { afterChoosing, afterRestoring: yield* tripNote },
        {
          afterChoosing: 'Bring a coin purse.',
          afterRestoring: 'Bring a coin purse and the Suica.',
        },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})
