import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Struct } from 'effect'

import { december } from '@/trip/domain'
import type { HomeState, IsoDate } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { liveTrip, operation, setTime, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

const trip = tripWith([option1, option2])

const chooseOption1 = Trip.use((trip) =>
  trip.choose({ operationId: operation(1), optionNumber: 1, replacing: null }),
)

/** Home's state at a moment given as an ISO 8601 UTC string. */
const homeAt = (instant: string) =>
  Effect.gen(function* () {
    yield* setTime(instant)
    return yield* Trip.use((trip) => trip.home)
  })

/** Home's state at a moment, before and after choosing Option 1. */
const homeWithAndWithoutSchedule = (instant: string) =>
  Effect.gen(function* () {
    const without = yield* homeAt(instant)
    const { scheduleId } = yield* chooseOption1
    const withSchedule = yield* homeAt(instant)
    return { without, withSchedule, scheduleId }
  })

/** Home by its phase, and which Schedule, Today or Itineraries it shows. */
const homeSummary = (home: HomeState) => {
  switch (home._tag) {
    case 'BeforeTrip':
      return {
        _tag: home._tag,
        daysToGo: home.daysToGo,
        scheduleId: home.schedule?.id ?? null,
        itineraries: home.itineraries.map(({ optionNumber }) => optionNumber),
      }
    case 'DuringTrip':
      return {
        _tag: home._tag,
        date: home.date,
        today: home.today?.day.date ?? null,
        itineraries: home.itineraries.map(({ optionNumber }) => optionNumber),
      }
    case 'AfterTrip':
      return {
        _tag: home._tag,
        scheduleId: home.schedule?.id ?? null,
        itineraries: home.itineraries.map(({ optionNumber }) => optionNumber),
      }
  }
}

describe('Trip.home at the Trip boundaries', () => {
  it.effect('is before the Trip at 23:59:59.999 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      const { without, withSchedule, scheduleId } =
        yield* homeWithAndWithoutSchedule('2026-12-05T14:59:59.999Z')
      assert.deepStrictEqual(
        {
          without: homeSummary(without),
          withSchedule: homeSummary(withSchedule),
        },
        {
          without: {
            _tag: 'BeforeTrip',
            daysToGo: 1,
            scheduleId: null,
            itineraries: [1, 2],
          },
          withSchedule: {
            _tag: 'BeforeTrip',
            daysToGo: 1,
            scheduleId,
            itineraries: [1, 2],
          },
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('is during the Trip at 00:00 on December 6 in Tokyo', () =>
    Effect.gen(function* () {
      const { without, withSchedule } = yield* homeWithAndWithoutSchedule(
        '2026-12-05T15:00:00Z',
      )
      assert.deepStrictEqual(
        {
          without: homeSummary(without),
          withSchedule: homeSummary(withSchedule),
        },
        {
          without: {
            _tag: 'DuringTrip',
            date: december(6),
            today: null,
            itineraries: [1, 2],
          },
          withSchedule: {
            _tag: 'DuringTrip',
            date: december(6),
            today: december(6),
            itineraries: [1, 2],
          },
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('is during the Trip at 23:59:59.999 on December 20 in Tokyo', () =>
    Effect.gen(function* () {
      const { without, withSchedule } = yield* homeWithAndWithoutSchedule(
        '2026-12-20T14:59:59.999Z',
      )
      assert.deepStrictEqual(
        {
          without: homeSummary(without),
          withSchedule: homeSummary(withSchedule),
        },
        {
          without: {
            _tag: 'DuringTrip',
            date: december(20),
            today: null,
            itineraries: [1, 2],
          },
          withSchedule: {
            _tag: 'DuringTrip',
            date: december(20),
            today: december(20),
            itineraries: [1, 2],
          },
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('is after the Trip at 00:00 on December 21 in Tokyo', () =>
    Effect.gen(function* () {
      const { without, withSchedule, scheduleId } =
        yield* homeWithAndWithoutSchedule('2026-12-20T15:00:00Z')
      assert.deepStrictEqual(
        {
          without: homeSummary(without),
          withSchedule: homeSummary(withSchedule),
        },
        {
          without: { _tag: 'AfterTrip', scheduleId: null, itineraries: [1, 2] },
          withSchedule: { _tag: 'AfterTrip', scheduleId, itineraries: [1, 2] },
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.home Today', () => {
  it.effect('records the moment it was read at', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-05T14:59:59.999Z')
      assert.strictEqual(home.readAt, '2026-12-05T14:59:59.999Z')
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('is the Day page of the Tokyo date', () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const home = yield* homeAt('2026-12-14T03:00:00Z')
      const dayPage = yield* Trip.use((trip) => trip.day(december(14)))
      assert.deepStrictEqual(
        home._tag === 'DuringTrip' ? home.today : null,
        Option.getOrThrow(dayPage),
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('follows the Tokyo date when it is ahead of the UTC date', () =>
    Effect.gen(function* () {
      // 16:00 UTC on December 13 is 01:00 on December 14 in Tokyo.
      const home = yield* homeAt('2026-12-13T16:00:00Z')
      assert.deepStrictEqual(homeSummary(home), {
        _tag: 'DuringTrip',
        date: december(14),
        today: null,
        itineraries: [1, 2],
      })
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('follows the Tokyo date late in the Tokyo evening', () =>
    Effect.gen(function* () {
      // 14:59 UTC on December 14 is 23:59 on December 14 in Tokyo.
      const home = yield* homeAt('2026-12-14T14:59:00Z')
      assert.deepStrictEqual(homeSummary(home), {
        _tag: 'DuringTrip',
        date: december(14),
        today: null,
        itineraries: [1, 2],
      })
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('shows the Schedule as a record after the Trip', () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const home = yield* homeAt('2026-12-25T03:00:00Z')
      const { current } = yield* Trip.use((trip) => trip.schedules)
      assert.deepStrictEqual(
        home._tag === 'AfterTrip' ? home.schedule : null,
        Option.getOrThrow(current),
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.home countdown', () => {
  const daysToGoAt = (instant: string) =>
    Effect.map(homeAt(instant), (home) =>
      home._tag === 'BeforeTrip' ? home.daysToGo : home._tag,
    )

  it.effect('shows 1 day remaining at 00:00 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* daysToGoAt('2026-12-04T15:00:00Z'), 1)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('follows the Tokyo date when it is ahead of the UTC date', () =>
    Effect.gen(function* () {
      // 16:00 UTC on November 30 is 01:00 on December 1 in Tokyo.
      assert.strictEqual(yield* daysToGoAt('2026-11-30T16:00:00Z'), 5)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('follows the Tokyo date late in the Tokyo evening', () =>
    Effect.gen(function* () {
      // 14:59 UTC on November 30 is 23:59 on November 30 in Tokyo.
      assert.strictEqual(yield* daysToGoAt('2026-11-30T14:59:00Z'), 6)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('counts across a month boundary in Tokyo', () =>
    Effect.gen(function* () {
      // 23:30 UTC on September 30 is 08:30 on October 1 in Tokyo.
      assert.strictEqual(yield* daysToGoAt('2026-09-30T23:30:00Z'), 66)
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.home Itineraries', () => {
  it.effect('lists every Itinerary in the catalogue', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-10-01T00:00:00Z')
      const itineraries = yield* Trip.use((trip) => trip.itineraries)
      // Home shows each Itinerary's summary, without its comparison rows.
      assert.deepStrictEqual(
        home.itineraries,
        itineraries.map((itinerary) =>
          Struct.pick(itinerary, [
            'optionNumber',
            'name',
            'recommended',
            'bestFor',
            'route',
            'nightsPerBase',
            'newToYou',
          ]),
        ),
      )
    }).pipe(Effect.provide([liveTrip, storage])),
  )
})

/** The Day page of the current Schedule for a date. */
const dayPage = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    Option.getOrThrow,
  )

describe('Trip.day', () => {
  it.effect('is empty before a Schedule is chosen', () =>
    Effect.gen(function* () {
      const found = yield* Trip.use((trip) => trip.day(december(14)))
      assert.isTrue(Option.isNone(found))
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with DayNotFound for a date outside the Trip', () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const before = yield* Effect.flip(
        Trip.use((trip) => trip.day('2026-12-05' as IsoDate)),
      )
      const after = yield* Effect.flip(
        Trip.use((trip) => trip.day('2026-12-21' as IsoDate)),
      )
      assert.deepStrictEqual(
        [before, after].map((error) => ({ tag: error._tag, date: error.date })),
        [
          { tag: 'DayNotFound', date: '2026-12-05' },
          { tag: 'DayNotFound', date: '2026-12-21' },
        ],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("shows the Schedule's Day, as the Schedule shows it", () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const { day } = yield* dayPage(december(8))
      const { current } = yield* Trip.use((trip) => trip.schedules)
      const schedule = Option.getOrThrow(current)
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
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "shows tonight's hotel as the Stay covering the night, hotel not recorded",
    () =>
      Effect.gen(function* () {
        yield* chooseOption1
        const { current } = yield* Trip.use((trip) => trip.schedules)
        const kyoto = Option.getOrThrow(current).stays[1]
        // A Move day ends in the Stay it moves to.
        const { tonight } = yield* dayPage(december(9))
        assert.deepStrictEqual(tonight, {
          id: kyoto?.id,
          base: kyoto?.base,
          checkIn: december(9),
          checkOut: december(13),
          nights: 4,
          hotel: { _tag: 'NotRecorded' },
        })
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("hides tonight's hotel on December 20", () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const { tonight } = yield* dayPage(december(20))
      assert.isUndefined(tonight)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('returns a Move dated the same Day as the next Move', () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const { day, nextMove } = yield* dayPage(december(13))
      assert.deepStrictEqual(nextMove, { date: december(13), ...day.move })
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('returns the first later Move as the next Move', () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const { nextMove } = yield* dayPage(december(10))
      assert.deepStrictEqual(
        nextMove && {
          date: nextMove.date,
          from: nextMove.from.romaji,
          to: nextMove.to.romaji,
        },
        { date: december(13), from: 'Kyoto', to: 'Kanazawa' },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('returns no next Move when none are left', () =>
    Effect.gen(function* () {
      yield* chooseOption1
      const { nextMove } = yield* dayPage(december(18))
      assert.isUndefined(nextMove)
    }).pipe(Effect.provide([trip, storage])),
  )
})
