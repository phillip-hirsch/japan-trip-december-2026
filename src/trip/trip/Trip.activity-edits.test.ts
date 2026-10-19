import { assert, describe, it } from '@effect/vitest'
import { Effect, Predicate } from 'effect'

import { december, TimeOfDay, TokyoDateTime } from '@/trip/domain/domain'
import { storage } from '@/trip/trip/testing'
import {
  trip,
  choose,
  add,
  edit,
  remove,
  move,
  activitiesOn,
  describedOn,
  dayWithThree,
} from '@/trip/trip/Trip.activities.testing'

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
          [TokyoDateTime.make('2026-12-20T23:59:00.000+09:00[Asia/Tokyo]')],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('lets the last write win for each field it carries', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const onsen = yield* add(2, scheduleId, december(14), 'Onsen', {
        time: '18:00',
      })

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
