import { assert, describe, it } from '@effect/vitest'
import { Effect, Predicate } from 'effect'

import { december, IsoDate, TokyoDateTime } from '@/trip/domain/domain'
import {
  activitiesOn,
  currentScheduleId,
  setTime,
  staleScheduleId,
  storage,
  tripWithOption1,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import {
  add,
  edit,
  remove,
  move,
  described,
  describedOn,
  dayWithThree,
} from '@/trip/trip/Trip.activities.testing'

describe('Trip.addActivity', () => {
  it.effect(
    'adds an Activity with a title and, optionally, a time and a note',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        yield* add(2, scheduleId, december(14), 'Onsen', {
          time: '18:00',
          note: 'Bring a towel.',
        })
        yield* add(3, scheduleId, december(14), 'Pack for the Alps')
        assert.deepStrictEqual(yield* describedOn(december(14)), [
          '18:00 Onsen (Bring a towel.)',
          '--:-- Pack for the Alps',
        ])
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'stores the time as a zoned date-time in Tokyo on the Activity’s Day',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        yield* add(2, scheduleId, december(15), 'Birthday dinner', {
          time: '19:00',
        })
        yield* add(3, scheduleId, december(15), 'Late bar', { time: '23:59' })
        assert.deepStrictEqual(
          (yield* activitiesOn(december(15))).map(({ time }) => time),
          [
            TokyoDateTime.make('2026-12-15T19:00:00.000+09:00[Asia/Tokyo]'),
            TokyoDateTime.make('2026-12-15T23:59:00.000+09:00[Asia/Tokyo]'),
          ],
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'records the international flights on the Arrival and Departure Days at the Tokyo-side time',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('trims the title and refuses a blank or overlong one', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
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
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('refuses a note past 10,000 characters with NoteTooLong', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId

      const error = yield* Effect.flip(
        add(2, scheduleId, december(14), 'Onsen', {
          note: 'あ'.repeat(10_001),
        }),
      )

      assert.deepStrictEqual(
        { tag: error._tag, activities: yield* activitiesOn(december(14)) },
        { tag: 'NoteTooLong', activities: [] },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'returns the recorded result for a repeated operation id, adding nothing more',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const first = yield* add(2, scheduleId, december(14), 'Onsen')
        const repeated = yield* add(2, scheduleId, december(14), 'Onsen')
        assert.deepStrictEqual(
          { repeated, activities: yield* describedOn(december(14)) },
          { repeated: first, activities: ['--:-- Onsen'] },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
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
    }).pipe(Effect.provide([tripWithOption1, storage])),
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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'refuses an Activity naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          add(3, staleScheduleId, december(14), 'Onsen'),
        )

        assert.deepStrictEqual(
          { tag: error._tag, activities: yield* activitiesOn(december(14)) },
          { tag: 'ScheduleChanged', activities: [] },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('fails with DayNotFound for a Day the Schedule lacks', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId

      const error = yield* Effect.flip(
        add(2, scheduleId, IsoDate.make('2026-12-21'), 'After the Trip'),
      )

      assert.deepStrictEqual(
        Predicate.isTagged('DayNotFound')(error)
          ? `${error._tag} ${error.date}`
          : error._tag,
        'DayNotFound 2026-12-21',
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})

describe('Activity writes to a missing target', () => {
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
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})

describe('Activities and the Schedule', () => {
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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
