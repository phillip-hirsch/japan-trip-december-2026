import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Predicate } from 'effect'

import { timeOfDayOf } from '@/trip/calendar'
import { december, IsoDate, TimeOfDay } from '@/trip/domain'
import type { Activity, EditActivity, ScheduleId } from '@/trip/domain'
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

const restore = (scheduleId: ScheduleId, n: number, replacing: ScheduleId) =>
  Trip.use((trip) =>
    trip.restore({ operationId: operation(n), scheduleId, replacing }),
  )

/** Adds an Activity, with a time and a note when given, returning its id. */
const add = (
  n: number,
  scheduleId: ScheduleId,
  date: IsoDate,
  title: string,
  details: { readonly time?: string; readonly note?: string } = {},
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.addActivity({
        operationId: operation(n),
        scheduleId,
        date,
        title,
        ...(details.time !== undefined && {
          time: TimeOfDay.make(details.time),
        }),
        ...(details.note !== undefined && { note: details.note }),
      }),
    ),
    ({ activityId }) => activityId,
  )

const edit = (input: EditActivity) =>
  Trip.use((trip) => trip.editActivity(input))

const remove = (scheduleId: ScheduleId, activityId: string) =>
  Trip.use((trip) => trip.removeActivity({ scheduleId, activityId }))

const move = (
  scheduleId: ScheduleId,
  activityId: string,
  before: string | null,
) => Trip.use((trip) => trip.moveActivity({ scheduleId, activityId, before }))

/** The Activities on a Day of the current Schedule, in their stored order. */
const activitiesOn = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).day.activities,
  )

/** One Activity as its Day page reads: its Tokyo time, title and note. */
const described = ({ title, time, note }: Activity) =>
  [
    time === undefined ? '--:--' : timeOfDayOf(time),
    title,
    ...(note ? [`(${note})`] : []),
  ].join(' ')

/** The Activities on a Day of the current Schedule, described in order. */
const describedOn = (date: IsoDate) =>
  Effect.map(activitiesOn(date), (activities) => activities.map(described))

/** A Day holding 09:00, an untimed Activity and 19:00, in that order. */
const dayWithThree = Effect.gen(function* () {
  const scheduleId = yield* choose(1, 1, null)

  const temple = yield* add(2, scheduleId, december(15), 'Kiyomizu-dera', {
    time: '09:00',
  })

  const walk = yield* add(3, scheduleId, december(15), 'Walk Gion')

  const dinner = yield* add(4, scheduleId, december(15), 'Birthday dinner', {
    time: '19:00',
  })

  return { scheduleId, temple, walk, dinner }
})

describe('Trip.addActivity', () => {
  it.effect(
    'adds an Activity with a title and, optionally, a time and a note',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        yield* add(2, scheduleId, december(14), 'Onsen', {
          time: '18:00',
          note: 'Bring a towel.',
        })
        yield* add(3, scheduleId, december(14), 'Pack for the Alps')
        assert.deepStrictEqual(yield* describedOn(december(14)), [
          '18:00 Onsen (Bring a towel.)',
          '--:-- Pack for the Alps',
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'stores the time as a zoned date-time in Tokyo on the Activity’s Day',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        yield* add(2, scheduleId, december(15), 'Birthday dinner', {
          time: '19:00',
        })
        yield* add(3, scheduleId, december(15), 'Late bar', { time: '23:59' })
        assert.deepStrictEqual(
          (yield* activitiesOn(december(15))).map(({ time }) => time),
          [
            '2026-12-15T19:00:00.000+09:00[Asia/Tokyo]',
            '2026-12-15T23:59:00.000+09:00[Asia/Tokyo]',
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'records the international flights on the Arrival and Departure Days at the Tokyo-side time',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        yield* add(2, scheduleId, december(6), 'Flight lands at Haneda', {
          time: '15:40',
          note: 'Departs YYZ 13:10 Dec 5, seat 32K.',
        })
        yield* add(3, scheduleId, december(20), 'Flight leaves Haneda', {
          time: '16:55',
          note: 'Arrives YYZ 15:30, seat 32K.',
        })
        assert.deepStrictEqual(
          {
            arrival: yield* describedOn(december(6)),
            departure: yield* describedOn(december(20)),
          },
          {
            arrival: [
              '15:40 Flight lands at Haneda (Departs YYZ 13:10 Dec 5, seat 32K.)',
            ],
            departure: [
              '16:55 Flight leaves Haneda (Arrives YYZ 15:30, seat 32K.)',
            ],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('trims the title and refuses a blank or overlong one', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      yield* add(2, scheduleId, december(14), '  Onsen  ')
      yield* add(3, scheduleId, december(14), 'あ'.repeat(200))
      const blank = yield* Effect.flip(add(4, scheduleId, december(14), '   '))

      const overlong = yield* Effect.flip(
        add(5, scheduleId, december(14), 'あ'.repeat(201)),
      )

      assert.deepStrictEqual(
        {
          errors: [blank, overlong].map((error) =>
            Predicate.isTagged('ActivityTitleInvalid')(error)
              ? `${error._tag} ${error.maxLength}`
              : error._tag,
          ),
          titles: (yield* activitiesOn(december(14))).map(
            ({ title }) => title.length,
          ),
        },
        {
          errors: ['ActivityTitleInvalid 200', 'ActivityTitleInvalid 200'],
          titles: [5, 200],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a note past 10,000 characters with NoteTooLong', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const error = yield* Effect.flip(
        add(2, scheduleId, december(14), 'Onsen', {
          note: 'あ'.repeat(10_001),
        }),
      )

      assert.deepStrictEqual(
        { tag: error._tag, activities: yield* activitiesOn(december(14)) },
        { tag: 'NoteTooLong', activities: [] },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the recorded result for a repeated operation id, adding nothing more',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const first = yield* add(2, scheduleId, december(14), 'Onsen')
        const repeated = yield* add(2, scheduleId, december(14), 'Onsen')
        assert.deepStrictEqual(
          { repeated, activities: yield* describedOn(december(14)) },
          { repeated: first, activities: ['--:-- Onsen'] },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('adds an untimed Activity after the rest', () =>
    Effect.gen(function* () {
      const { scheduleId } = yield* dayWithThree
      yield* add(5, scheduleId, december(15), 'Buy souvenirs')
      assert.deepStrictEqual(yield* describedOn(december(15)), [
        '09:00 Kiyomizu-dera',
        '--:-- Walk Gion',
        '19:00 Birthday dinner',
        '--:-- Buy souvenirs',
      ])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'inserts a timed Activity before the first Activity with a later time',
    () =>
      Effect.gen(function* () {
        const { scheduleId } = yield* dayWithThree
        yield* add(5, scheduleId, december(15), 'Lunch', { time: '12:00' })
        yield* add(6, scheduleId, december(15), 'Breakfast', { time: '07:30' })
        yield* add(7, scheduleId, december(15), 'Cake', { time: '19:00' })
        yield* add(8, scheduleId, december(15), 'Night walk', { time: '22:00' })
        assert.deepStrictEqual(yield* describedOn(december(15)), [
          '07:30 Breakfast',
          '09:00 Kiyomizu-dera',
          '--:-- Walk Gion',
          '12:00 Lunch',
          '19:00 Birthday dinner',
          '19:00 Cake',
          '22:00 Night walk',
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses an Activity naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const stale = yield* choose(1, 1, null)
        yield* choose(2, 2, stale)
        const error = yield* Effect.flip(add(3, stale, december(14), 'Onsen'))
        assert.deepStrictEqual(
          { tag: error._tag, activities: yield* activitiesOn(december(14)) },
          { tag: 'ScheduleChanged', activities: [] },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with DayNotFound for a Day the Schedule lacks', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const error = yield* Effect.flip(
        add(2, scheduleId, IsoDate.make('2026-12-21'), 'After the Trip'),
      )

      assert.deepStrictEqual(
        Predicate.isTagged('DayNotFound')(error)
          ? `${error._tag} ${error.date}`
          : error._tag,
        'DayNotFound 2026-12-21',
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.editActivity', () => {
  it.effect('edits an Activity’s title, time and note', () =>
    Effect.gen(function* () {
      const { scheduleId, walk } = yield* dayWithThree
      yield* edit({
        scheduleId,
        activityId: walk,
        title: '  Walk Gion at dusk ',
        time: TimeOfDay.make('17:00'),
        note: 'Hanami-koji first.',
      })
      assert.deepStrictEqual(yield* describedOn(december(15)), [
        '09:00 Kiyomizu-dera',
        '17:00 Walk Gion at dusk (Hanami-koji first.)',
        '19:00 Birthday dinner',
      ])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'keeps the stored order when a time changes, never re-sorting',
    () =>
      Effect.gen(function* () {
        const { scheduleId, temple } = yield* dayWithThree
        yield* edit({
          scheduleId,
          activityId: temple,
          time: TimeOfDay.make('21:00'),
        })
        assert.deepStrictEqual(yield* describedOn(december(15)), [
          '21:00 Kiyomizu-dera',
          '--:-- Walk Gion',
          '19:00 Birthday dinner',
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'removes the time when edited to null and the note when empty',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)

        const onsen = yield* add(2, scheduleId, december(14), 'Onsen', {
          time: '18:00',
          note: 'Bring a towel.',
        })

        yield* edit({ scheduleId, activityId: onsen, time: null, note: '' })
        assert.deepStrictEqual(yield* activitiesOn(december(14)), [
          { id: onsen, title: 'Onsen' },
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'keeps the time on the Activity’s own Day whatever time is written',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)

        const late = yield* add(2, scheduleId, december(20), 'Flight', {
          time: '08:00',
        })

        yield* edit({
          scheduleId,
          activityId: late,
          time: TimeOfDay.make('23:59'),
        })
        assert.deepStrictEqual(
          (yield* activitiesOn(december(20))).map(({ time }) => time),
          ['2026-12-20T23:59:00.000+09:00[Asia/Tokyo]'],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('lets the last write win for each field it carries', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const onsen = yield* add(2, scheduleId, december(14), 'Onsen', {
        time: '18:00',
      })

      // One device renames it while another adds a note.
      yield* edit({ scheduleId, activityId: onsen, title: 'Onsen, Hakone' })
      yield* edit({ scheduleId, activityId: onsen, note: 'Bring a towel.' })
      yield* edit({ scheduleId, activityId: onsen, title: 'Onsen, Gora' })
      assert.deepStrictEqual(yield* describedOn(december(14)), [
        '18:00 Onsen, Gora (Bring a towel.)',
      ])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a blank title and an overlong note, writing nothing', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const onsen = yield* add(2, scheduleId, december(14), 'Onsen')

      const blank = yield* Effect.flip(
        edit({ scheduleId, activityId: onsen, title: ' ', note: 'Kept?' }),
      )

      const overlong = yield* Effect.flip(
        edit({
          scheduleId,
          activityId: onsen,
          title: 'Renamed?',
          note: 'あ'.repeat(10_001),
        }),
      )

      assert.deepStrictEqual(
        {
          errors: [blank._tag, overlong._tag],
          activities: yield* describedOn(december(14)),
        },
        {
          errors: ['ActivityTitleInvalid', 'NoteTooLong'],
          activities: ['--:-- Onsen'],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.removeActivity', () => {
  it.effect('removes an Activity, keeping the rest in order', () =>
    Effect.gen(function* () {
      const { scheduleId, walk } = yield* dayWithThree
      yield* remove(scheduleId, walk)
      assert.deepStrictEqual(yield* describedOn(december(15)), [
        '09:00 Kiyomizu-dera',
        '19:00 Birthday dinner',
      ])
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.moveActivity', () => {
  it.effect('moves an Activity before another on its Day, or last', () =>
    Effect.gen(function* () {
      const { scheduleId, temple, walk, dinner } = yield* dayWithThree
      yield* move(scheduleId, dinner, temple)
      const first = yield* describedOn(december(15))
      yield* move(scheduleId, dinner, null)
      yield* move(scheduleId, walk, temple)
      assert.deepStrictEqual(
        { first, second: yield* describedOn(december(15)) },
        {
          first: [
            '19:00 Birthday dinner',
            '09:00 Kiyomizu-dera',
            '--:-- Walk Gion',
          ],
          second: [
            '--:-- Walk Gion',
            '09:00 Kiyomizu-dera',
            '19:00 Birthday dinner',
          ],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('keeps the moved order for timed Activities added later', () =>
    Effect.gen(function* () {
      const { scheduleId, temple, dinner } = yield* dayWithThree
      yield* move(scheduleId, dinner, temple)
      yield* add(5, scheduleId, december(15), 'Lunch', { time: '12:00' })
      assert.deepStrictEqual(yield* describedOn(december(15)), [
        '12:00 Lunch',
        '19:00 Birthday dinner',
        '09:00 Kiyomizu-dera',
        '--:-- Walk Gion',
      ])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'never moves an Activity to another Day, failing with ActivityNotFound',
    () =>
      Effect.gen(function* () {
        const { scheduleId, walk } = yield* dayWithThree
        const onsen = yield* add(5, scheduleId, december(14), 'Onsen')
        const error = yield* Effect.flip(move(scheduleId, walk, onsen))
        assert.deepStrictEqual(
          {
            error: Predicate.isTagged('ActivityNotFound')(error)
              ? error.activityId === onsen
              : error._tag,
            fourteenth: yield* describedOn(december(14)),
            fifteenth: yield* describedOn(december(15)),
          },
          {
            error: true,
            fourteenth: ['--:-- Onsen'],
            fifteenth: [
              '09:00 Kiyomizu-dera',
              '--:-- Walk Gion',
              '19:00 Birthday dinner',
            ],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Activity writes to a missing, stale or archived target', () => {
  it.effect('fail with ActivityNotFound for an Activity since removed', () =>
    Effect.gen(function* () {
      const { scheduleId, walk, temple } = yield* dayWithThree
      yield* remove(scheduleId, walk)

      const errors = yield* Effect.all([
        Effect.flip(
          edit({ scheduleId, activityId: walk, title: 'Walk Gion again' }),
        ),
        Effect.flip(remove(scheduleId, walk)),
        Effect.flip(move(scheduleId, walk, null)),
        Effect.flip(move(scheduleId, temple, walk)),
      ])

      assert.deepStrictEqual(
        errors.map((error) =>
          Predicate.isTagged('ActivityNotFound')(error)
            ? error.activityId === walk
            : error._tag,
        ),
        [true, true, true, true],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuse every write naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const { scheduleId: stale, walk, temple } = yield* dayWithThree
        yield* choose(2, 5, stale)

        const errors = yield* Effect.all([
          Effect.flip(
            edit({ scheduleId: stale, activityId: walk, title: 'Renamed' }),
          ),
          Effect.flip(remove(stale, walk)),
          Effect.flip(move(stale, walk, temple)),
        ])

        assert.deepStrictEqual(
          errors.map(({ _tag }) => _tag),
          ['ScheduleChanged', 'ScheduleChanged', 'ScheduleChanged'],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'reject every write to an archived Schedule, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const { scheduleId: archived, walk, temple } = yield* dayWithThree
        yield* choose(2, 5, archived)

        const errors = yield* Effect.all([
          Effect.flip(add(6, archived, december(15), 'Added after archiving')),
          Effect.flip(
            edit({ scheduleId: archived, activityId: walk, title: 'Renamed' }),
          ),
          Effect.flip(remove(archived, walk)),
          Effect.flip(move(archived, walk, temple)),
        ])

        const schedule = yield* Trip.use((trip) => trip.schedule(archived))

        assert.deepStrictEqual(
          {
            errors: errors.map(({ _tag }) => _tag),
            status: schedule.status,
            activities: schedule.days
              .find((day) => day.date === december(15))
              ?.activities.map(described),
          },
          {
            errors: [
              'ScheduleChanged',
              'ScheduleChanged',
              'ScheduleChanged',
              'ScheduleChanged',
            ],
            status: 'archived',
            activities: [
              '09:00 Kiyomizu-dera',
              '--:-- Walk Gion',
              '19:00 Birthday dinner',
            ],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Activities and the Schedule', () => {
  it.effect('leaves Activities behind when choosing again', () =>
    Effect.gen(function* () {
      const { scheduleId } = yield* dayWithThree
      yield* choose(2, 5, scheduleId)
      assert.deepStrictEqual(yield* activitiesOn(december(15)), [])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'brings Activities back, in order, when restoring their Schedule',
    () =>
      Effect.gen(function* () {
        const { scheduleId, temple, dinner } = yield* dayWithThree
        yield* move(scheduleId, dinner, temple)
        const replacement = yield* choose(2, 5, scheduleId)
        yield* restore(scheduleId, 6, replacement)
        assert.deepStrictEqual(yield* describedOn(december(15)), [
          '19:00 Birthday dinner',
          '09:00 Kiyomizu-dera',
          '--:-- Walk Gion',
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'shows the current Day’s Activities, in order with their times, on Today',
    () =>
      Effect.gen(function* () {
        const { scheduleId } = yield* dayWithThree
        yield* setTime('2026-12-15T01:00:00Z')
        const home = yield* Trip.use((trip) => trip.home)
        assert.deepStrictEqual(
          Predicate.isTagged('DuringTrip')(home) && home.today
            ? {
                scheduleId: home.today.scheduleId,
                activities: home.today.day.activities.map(described),
              }
            : undefined,
          {
            scheduleId,
            activities: [
              '09:00 Kiyomizu-dera',
              '--:-- Walk Gion',
              '19:00 Birthday dinner',
            ],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )
})
