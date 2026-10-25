import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Predicate } from 'effect'

import { december, HomeState, Hotel, IsoDate } from '@/trip/domain/domain'
import {
  currentSchedule,
  setTime,
  storage,
  tripWithOptions1And2,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const inTokyo = (wallTime: string) =>
  DateTime.formatIso(
    DateTime.makeZonedUnsafe(wallTime, {
      timeZone: 'Asia/Tokyo',
      adjustForTimeZone: true,
    }),
  )

const homeAt = (instant: string) =>
  Effect.gen(function* () {
    yield* setTime(instant)

    return yield* Trip.use((trip) => trip.home)
  })

const dayPage = (date: IsoDate) => Trip.use((trip) => trip.day(date))

describe('Trip.home at the Trip boundaries', () => {
  it.effect('is before the Trip at 23:59:59.999 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      const readAt = '2026-12-05T14:59:59.999Z'
      const home = yield* homeAt(readAt)
      const schedule = yield* currentSchedule

      assert.deepStrictEqual(
        home,
        HomeState.cases.BeforeTrip.make({
          readAt,
          daysToGo: 1,
          schedule,
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('is during the Trip at 00:00 on December 6 in Tokyo', () =>
    Effect.gen(function* () {
      const readAt = '2026-12-05T15:00:00.000Z'
      const home = yield* homeAt(readAt)
      const today = yield* dayPage(december(6))

      assert.deepStrictEqual(
        home,
        HomeState.cases.DuringTrip.make({
          readAt,
          date: december(6),
          today,
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('is during the Trip at 23:59:59.999 on December 20 in Tokyo', () =>
    Effect.gen(function* () {
      const readAt = '2026-12-20T14:59:59.999Z'
      const home = yield* homeAt(readAt)
      const today = yield* dayPage(december(20))

      assert.deepStrictEqual(
        home,
        HomeState.cases.DuringTrip.make({
          readAt,
          date: december(20),
          today,
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('is after the Trip at 00:00 on December 21 in Tokyo', () =>
    Effect.gen(function* () {
      const readAt = '2026-12-20T15:00:00.000Z'
      const home = yield* homeAt(readAt)
      const schedule = yield* currentSchedule

      assert.deepStrictEqual(
        home,
        HomeState.cases.AfterTrip.make({
          readAt,
          schedule,
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})

describe('Trip.home Today', () => {
  it.effect('records the moment it was read at', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-05T14:59:59.999Z')
      assert.strictEqual(home.readAt, '2026-12-05T14:59:59.999Z')
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('is the Day page of the Tokyo date', () =>
    Effect.gen(function* () {
      const readAt = '2026-12-14T03:00:00.000Z'
      const home = yield* homeAt(readAt)
      assert.deepStrictEqual(
        home,
        HomeState.cases.DuringTrip.make({
          readAt,
          date: december(14),
          today: yield* dayPage(december(14)),
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('follows the Tokyo date when it is ahead of the UTC date', () =>
    Effect.gen(function* () {
      const readAt = inTokyo('2026-12-14T01:00')
      const home = yield* homeAt(readAt)
      assert.deepStrictEqual(
        home,
        HomeState.cases.DuringTrip.make({
          readAt,
          date: december(14),
          today: yield* dayPage(december(14)),
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('follows the Tokyo date late in the Tokyo evening', () =>
    Effect.gen(function* () {
      const readAt = inTokyo('2026-12-14T23:59')
      const home = yield* homeAt(readAt)
      assert.deepStrictEqual(
        home,
        HomeState.cases.DuringTrip.make({
          readAt,
          date: december(14),
          today: yield* dayPage(december(14)),
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('shows the Schedule as a record after the Trip', () =>
    Effect.gen(function* () {
      const readAt = '2026-12-25T03:00:00.000Z'
      const home = yield* homeAt(readAt)
      const { current } = yield* Trip.use((trip) => trip.schedules)
      assert.deepStrictEqual(
        home,
        HomeState.cases.AfterTrip.make({
          readAt,
          schedule: current,
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})

describe('Trip.home Today across Tokyo midnight', () => {
  const todayAt = (instant: string) =>
    Effect.map(homeAt(instant), (home) =>
      Predicate.isTagged(home, 'DuringTrip') ? home.today.day.date : home._tag,
    )

  it.effect(
    'is December 14 at its last moment and December 15 at the first moment after, in Tokyo',
    () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(
          [
            yield* todayAt(inTokyo('2026-12-14T23:59:59.999')),
            yield* todayAt(inTokyo('2026-12-15T00:00:00.000')),
          ],
          [december(14), december(15)],
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'follows the Tokyo date while the UTC date is still the day before',
    () =>
      Effect.gen(function* () {
        const readAt = '2026-12-14T16:30:00.000Z'
        const home = yield* homeAt(readAt)
        const today = yield* dayPage(december(15))

        assert.deepStrictEqual(
          home,
          HomeState.cases.DuringTrip.make({
            readAt,
            date: december(15),
            today,
          }),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})

describe('Trip.home countdown', () => {
  const assertCountdown = (readAt: string, daysToGo: number) =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* homeAt(readAt),
        HomeState.cases.BeforeTrip.make({
          readAt,
          daysToGo,
          schedule: yield* currentSchedule,
        }),
      )
    })

  it.effect('shows 1 day remaining at 00:00 on December 5 in Tokyo', () =>
    assertCountdown('2026-12-04T15:00:00.000Z', 1).pipe(
      Effect.provide([tripWithOptions1And2, storage]),
    ),
  )

  it.effect('follows the Tokyo date when it is ahead of the UTC date', () =>
    assertCountdown(inTokyo('2026-12-01T01:00'), 5).pipe(
      Effect.provide([tripWithOptions1And2, storage]),
    ),
  )

  it.effect('follows the Tokyo date late in the Tokyo evening', () =>
    assertCountdown(inTokyo('2026-11-30T23:59'), 6).pipe(
      Effect.provide([tripWithOptions1And2, storage]),
    ),
  )

  it.effect('counts across a month boundary in Tokyo', () =>
    assertCountdown(inTokyo('2026-10-01T08:30'), 66).pipe(
      Effect.provide([tripWithOptions1And2, storage]),
    ),
  )
})

describe('Trip.day', () => {
  it.effect('fails with DayNotFound for a date outside the Trip', () =>
    Effect.gen(function* () {
      const before = yield* Effect.flip(
        Trip.use((trip) => trip.day(IsoDate.make('2026-12-05'))),
      )

      const after = yield* Effect.flip(
        Trip.use((trip) => trip.day(IsoDate.make('2026-12-21'))),
      )

      assert.deepStrictEqual(
        [before, after].map((error) => ({ tag: error._tag, date: error.date })),
        [
          { tag: 'DayNotFound', date: '2026-12-05' },
          { tag: 'DayNotFound', date: '2026-12-21' },
        ],
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect("shows the Schedule's Day, as the Schedule shows it", () =>
    Effect.gen(function* () {
      const { day } = yield* dayPage(december(8))
      const schedule = yield* currentSchedule
      assert.deepStrictEqual(
        {
          day,
          description: day.description,
          dayTrips: day.dayTrips.map(({ place }) => place.romaji),
        },
        {
          day: schedule.days.find((day) => day.date === december(8)),
          description: 'Kamakura.',
          dayTrips: ['Kamakura'],
        },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    "shows tonight's hotel as the Stay covering the night, hotel not recorded",
    () =>
      Effect.gen(function* () {
        const kyoto = (yield* currentSchedule).stays[1]
        const { tonight } = yield* dayPage(december(9))
        assert.deepStrictEqual(tonight, {
          id: kyoto?.id,
          base: kyoto?.base,
          checkIn: december(9),
          checkOut: december(13),
          nights: 4,
          hotel: Hotel.cases.NotRecorded.make({}),
        })
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect("hides tonight's hotel on December 20", () =>
    Effect.gen(function* () {
      const { tonight } = yield* dayPage(december(20))
      assert.isUndefined(tonight)
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('returns a Move dated the same Day as the next Move', () =>
    Effect.gen(function* () {
      const { day, nextMove } = yield* dayPage(december(13))
      assert.deepStrictEqual(nextMove, { date: december(13), ...day.move })
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('returns the first later Move as the next Move', () =>
    Effect.gen(function* () {
      const { nextMove } = yield* dayPage(december(10))
      assert.deepStrictEqual(
        nextMove && {
          date: nextMove.date,
          from: nextMove.from.romaji,
          to: nextMove.to.romaji,
        },
        { date: december(13), from: 'Kyoto', to: 'Kanazawa' },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect('returns no next Move when none are left', () =>
    Effect.gen(function* () {
      const { nextMove } = yield* dayPage(december(18))
      assert.isUndefined(nextMove)
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})
