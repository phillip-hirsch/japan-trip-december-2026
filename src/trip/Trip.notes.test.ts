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

const writeStayNote = (scheduleId: ScheduleId, stayId: string, note: string) =>
  Trip.use((trip) => trip.writeStayNote({ scheduleId, stayId, note }))

const writeTripNote = (note: string) =>
  Trip.use((trip) => trip.writeTripNote({ note }))

const restore = (scheduleId: ScheduleId, n: number, replacing: ScheduleId) =>
  Trip.use((trip) =>
    trip.restore({ operationId: operation(n), scheduleId, replacing }),
  )

/** A Schedule's Stays, current or archived, in Trip order. */
const staysOf = (scheduleId: ScheduleId) =>
  Effect.map(
    Trip.use((trip) => trip.schedule(scheduleId)),
    ({ stays }) => stays,
  )

/** The id of a Schedule's first Stay. */
const firstStayId = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[0]?.id ?? '')

/** The Stay note on a Schedule's first Stay, if it has one. */
const firstStayNote = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[0]?.note)

/** Every Stay note a Schedule has. */
const stayNotesOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) =>
    stays.flatMap(({ note }) => note ?? []),
  )

/** The Trip note as /schedule shows it, if Phillip has written one. */
const tripNote = Effect.map(
  Trip.use((trip) => trip.schedules),
  ({ tripNote }) => tripNote,
)

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
          maxLength: Predicate.isTagged('NoteTooLong')(error)
            ? error.maxLength
            : 0,
          kept: (yield* dayNote(december(14))) === longest,
        },
        { tag: 'NoteTooLong', maxLength: 10_000, kept: true },
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

describe('Trip.writeStayNote', () => {
  it.effect('leaves the last of two successive writes', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const stayId = yield* firstStayId(scheduleId)
      yield* writeStayNote(scheduleId, stayId, 'Asakusa is quiet at night.')
      yield* writeStayNote(scheduleId, stayId, 'Try the kissaten by Exit 3.')
      assert.strictEqual(
        yield* firstStayNote(scheduleId),
        'Try the kissaten by Exit 3.',
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a write naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const stale = yield* choose(1, 1, null)
        const staleStayId = yield* firstStayId(stale)
        // Another device chooses again, so this screen's Schedule is stale.
        const current = yield* choose(2, 2, stale)

        const error = yield* Effect.flip(
          writeStayNote(stale, staleStayId, 'Written on an old screen.'),
        )

        assert.deepStrictEqual(
          {
            tag: error._tag,
            stale: yield* stayNotesOf(stale),
            current: yield* stayNotesOf(current),
          },
          { tag: 'ScheduleChanged', stale: [], current: [] },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'rejects a write to an archived Schedule, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        const stayId = yield* firstStayId(archived)
        yield* writeStayNote(archived, stayId, 'Asakusa is quiet at night.')
        yield* choose(2, 2, archived)

        const error = yield* Effect.flip(
          writeStayNote(archived, stayId, 'Rewritten after archiving.'),
        )

        assert.deepStrictEqual(
          { tag: error._tag, note: yield* firstStayNote(archived) },
          { tag: 'ScheduleChanged', note: 'Asakusa is quiet at night.' },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with StayNotFound for a Stay the Schedule lacks', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
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
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('accepts 10,000 characters and rejects one more', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
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
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('removes the Stay note when written empty', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const stayId = yield* firstStayId(scheduleId)
      yield* writeStayNote(scheduleId, stayId, 'Asakusa is quiet at night.')
      yield* writeStayNote(scheduleId, stayId, '')
      assert.isUndefined(yield* firstStayNote(scheduleId))
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'keeps Stay notes with their archived Schedule, apart from the fresh one, until restored',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, 1, null)
        const stayId = yield* firstStayId(first)
        yield* writeStayNote(first, stayId, 'Asakusa is quiet at night.')
        const second = yield* choose(1, 2, first)
        const whileArchived = yield* firstStayNote(first)
        const fresh = yield* stayNotesOf(second)
        yield* restore(first, 3, second)

        const current = yield* Trip.use((trip) => trip.schedules).pipe(
          Effect.map(({ current }) => Option.getOrThrow(current)),
        )

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
      }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.writeTripNote', () => {
  it.effect('leaves the last of two successive writes', () =>
    Effect.gen(function* () {
      yield* choose(1, 1, null)
      yield* writeTripNote('Bring a coin purse.')
      yield* writeTripNote('Bring a coin purse and the Suica.')
      assert.strictEqual(yield* tripNote, 'Bring a coin purse and the Suica.')
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('has no Trip note until Phillip writes one', () =>
    Effect.gen(function* () {
      yield* choose(1, 1, null)
      assert.isUndefined(yield* tripNote)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('removes the Trip note when written empty', () =>
    Effect.gen(function* () {
      yield* choose(1, 1, null)
      yield* writeTripNote('Bring a coin purse.')
      yield* writeTripNote('')
      assert.isUndefined(yield* tripNote)
    }).pipe(Effect.provide([trip, storage])),
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
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('carries the Trip note over on choosing again and restoring', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
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
    }).pipe(Effect.provide([trip, storage])),
  )
})
