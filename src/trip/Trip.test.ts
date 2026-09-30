import { assert, describe, it, layer } from '@effect/vitest'
import { DateTime, Effect, Layer, Predicate } from 'effect'
import { TestClock } from 'effect/testing'

import { december } from '@/trip/domain'
import type { ItineraryContent, TripRuleBreak } from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { option1 } from '@/trip/itineraries/option-1'
import { Trip } from '@/trip/Trip'

const tripWith = (contents: ReadonlyArray<ItineraryContent>) =>
  Trip.layer.pipe(Layer.provide(Itineraries.fromContent(contents)))

const liveTrip = Trip.layer.pipe(Layer.provide(Itineraries.layer))

const homeAt = (instant: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(
      DateTime.toEpochMillis(DateTime.makeUnsafe(instant)),
    )
    const trip = yield* Trip
    return yield* trip.home
  }).pipe(Effect.provide(liveTrip))

describe('Trip.home countdown', () => {
  it.effect('shows 1 day remaining at 23:59 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-05T14:59:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 1 })
    }),
  )

  it.effect('shows 1 day remaining at 00:00 on December 5 in Tokyo', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-04T15:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 1 })
    }),
  )

  it.effect('has ended at 00:00 on December 6 in Tokyo', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-05T15:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Ended' })
    }),
  )

  it.effect('stays ended after the Trip', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-12-21T03:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Ended' })
    }),
  )

  it.effect('follows the Tokyo date when it is ahead of the UTC date', () =>
    Effect.gen(function* () {
      // 16:00 UTC on November 30 is 01:00 on December 1 in Tokyo.
      const home = yield* homeAt('2026-11-30T16:00:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 5 })
    }),
  )

  it.effect('follows the Tokyo date late in the Tokyo evening', () =>
    Effect.gen(function* () {
      // 14:59 UTC on November 30 is 23:59 on November 30 in Tokyo.
      const home = yield* homeAt('2026-11-30T14:59:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 6 })
    }),
  )

  it.effect('counts across a month boundary in Tokyo', () =>
    Effect.gen(function* () {
      // 23:30 UTC on September 30 is 08:30 on October 1 in Tokyo.
      const home = yield* homeAt('2026-09-30T23:30:00Z')
      assert.deepStrictEqual(home.countdown, { _tag: 'Counting', days: 66 })
    }),
  )
})

describe('Trip.home Itineraries', () => {
  it.effect('lists each Itinerary by Option number and name', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-10-01T00:00:00Z')
      assert.deepStrictEqual(home.itineraries, [
        { optionNumber: 1, name: 'Kyoto + Kanazawa' },
      ])
    }),
  )
})

layer(liveTrip)('Every Itinerary', (it) => {
  it.effect('satisfies every Trip rule', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      for (const { optionNumber } of yield* trip.itineraries) {
        assert.deepStrictEqual(
          { optionNumber, breaks: yield* trip.tripRuleBreaks(optionNumber) },
          { optionNumber, breaks: [] },
        )
      }
    }),
  )
})

layer(liveTrip)('Option 1', (it) => {
  const option1Detail = Trip.use((trip) => trip.itinerary(1))

  it.effect('is labelled Option 1 with its name', () =>
    Effect.gen(function* () {
      const { optionNumber, name } = yield* option1Detail
      assert.deepStrictEqual(
        { optionNumber, name },
        { optionNumber: 1, name: 'Kyoto + Kanazawa' },
      )
    }),
  )

  it.effect('covers 14 nights from December 6 to December 20', () =>
    Effect.gen(function* () {
      const { stays } = yield* option1Detail
      assert.strictEqual(
        stays.reduce((nights, stay) => nights + stay.nights, 0),
        14,
      )
      assert.strictEqual(stays[0]?.checkIn, '2026-12-06')
      assert.strictEqual(stays.at(-1)?.checkOut, '2026-12-20')
    }),
  )

  it.effect('has back-to-back Stays of at least one night each', () =>
    Effect.gen(function* () {
      const { stays } = yield* option1Detail
      assert.deepStrictEqual(
        stays.map((stay) => [
          stay.base.romaji,
          stay.checkIn,
          stay.checkOut,
          stay.nights,
        ]),
        [
          ['Tokyo', '2026-12-06', '2026-12-09', 3],
          ['Kyoto', '2026-12-09', '2026-12-13', 4],
          ['Kanazawa', '2026-12-13', '2026-12-17', 4],
          ['Tokyo', '2026-12-17', '2026-12-20', 3],
        ],
      )
    }),
  )

  it.effect('shows each Base in kanji and whether it is a New place', () =>
    Effect.gen(function* () {
      const { stays } = yield* option1Detail
      assert.deepStrictEqual(
        stays.map(({ base }) => [base.kanji, base.romaji, base.newPlace]),
        [
          ['東京', 'Tokyo', false],
          ['京都', 'Kyoto', false],
          ['金沢', 'Kanazawa', true],
          ['東京', 'Tokyo', false],
        ],
      )
    }),
  )

  it.effect(
    'wakes up in Kyoto for Shigeharu on the morning of December 11',
    () =>
      Effect.gen(function* () {
        const { stays, days } = yield* option1Detail
        const night10 = stays.find(
          (stay) =>
            stay.checkIn <= '2026-12-10' && stay.checkOut > '2026-12-10',
        )
        assert.strictEqual(night10?.base.id, 'kyoto')
        assert.deepStrictEqual(
          days.find((day) => day.date === '2026-12-11')?.anchors,
          [
            {
              _tag: 'ShigeharuVisit',
              date: december(11),
              slot: 'morning',
              tentative: true,
              thursdayBackup: true,
            },
          ],
        )
      }),
  )

  it.effect('has no Move on December 15 and ends in Tokyo', () =>
    Effect.gen(function* () {
      const { stays, days } = yield* option1Detail
      assert.deepStrictEqual(
        days.filter((day) => day.move).map((day) => day.date),
        ['2026-12-09', '2026-12-13', '2026-12-17'],
      )
      assert.strictEqual(stays.at(-1)?.base.id, 'tokyo')
    }),
  )

  it.effect('infers each Move from a Stay boundary', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.flatMap(({ move }) =>
          move ? [[move.from.romaji, move.to.romaji]] : [],
        ),
        [
          ['Tokyo', 'Kyoto'],
          ['Kyoto', 'Kanazawa'],
          ['Kanazawa', 'Tokyo'],
        ],
      )
    }),
  )

  it.effect('has all 15 Days from December 6 to December 20', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.map((day) => day.date),
        Array.from({ length: 15 }, (_, index) => december(6 + index)),
      )
    }),
  )

  it.effect('shows only Days the source describes, and marks Free days', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.filter((day) => day.description === undefined).map((d) => d.date),
        ['2026-12-13', '2026-12-14', '2026-12-16', '2026-12-17', '2026-12-20'],
      )
      assert.deepStrictEqual(
        days.filter((day) => day.freeDay).map((day) => day.date),
        ['2026-12-14', '2026-12-16'],
      )
    }),
  )

  it.effect('marks the Anchors on their Days', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.flatMap((day) =>
          day.anchors.map((anchor) => [day.date, anchor._tag]),
        ),
        [
          ['2026-12-06', 'Arrival'],
          ['2026-12-11', 'ShigeharuVisit'],
          ['2026-12-15', 'Birthday'],
          ['2026-12-20', 'Departure'],
        ],
      )
    }),
  )

  it.effect('fails with ItineraryNotFound for an unknown Option number', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      const error = yield* Effect.flip(trip.itinerary(99))
      assert.deepStrictEqual(
        { tag: error._tag, optionNumber: error.optionNumber },
        { tag: 'ItineraryNotFound', optionNumber: 99 },
      )
    }),
  )
})

/** Option 1 with some of its content replaced. */
const brokenOption1 = (
  changes: Partial<ItineraryContent>,
): ItineraryContent => ({ ...option1, ...changes })

const stays = (
  ...ranges: ReadonlyArray<
    readonly [base: ItineraryContent['stays'][number]['base'], number, number]
  >
) =>
  ranges.map(([base, checkIn, checkOut]) => ({
    base,
    checkIn: december(checkIn),
    checkOut: december(checkOut),
  }))

const ruleBreaksOf = (content: ItineraryContent) =>
  Trip.use((trip) => trip.tripRuleBreaks(content.optionNumber)).pipe(
    Effect.provide(tripWith([content])),
  )

describe('Trip rules', () => {
  const cases: ReadonlyArray<
    readonly [
      reason: string,
      content: ItineraryContent,
      breaks: ReadonlyArray<TripRuleBreak>,
    ]
  > = [
    [
      'Shigeharu missing',
      brokenOption1({ shigeharuVisit: undefined }),
      [{ _tag: 'ShigeharuMissing' }],
    ],
    [
      'Shigeharu on the wrong date',
      brokenOption1({
        shigeharuVisit: { date: december(12), slot: 'morning' },
      }),
      [{ _tag: 'ShigeharuWrongDate', date: december(12) }],
    ],
    [
      'Shigeharu not in the morning',
      brokenOption1({
        shigeharuVisit: { date: december(11), slot: 'afternoon' },
      }),
      [{ _tag: 'ShigeharuNotInMorning', slot: 'afternoon' }],
    ],
    [
      'a Move on December 15',
      brokenOption1({
        stays: stays(
          ['tokyo', 6, 9],
          ['kyoto', 9, 15],
          ['kanazawa', 15, 17],
          ['tokyo', 17, 20],
        ),
      }),
      [{ _tag: 'MoveOnBirthday' }],
    ],
    [
      'a gap',
      brokenOption1({
        stays: stays(
          ['tokyo', 6, 9],
          ['kyoto', 9, 13],
          ['kanazawa', 14, 17],
          ['tokyo', 17, 20],
        ),
      }),
      [{ _tag: 'Gap', from: december(13), to: december(14) }],
    ],
    [
      'an overlap',
      brokenOption1({
        stays: stays(
          ['tokyo', 6, 9],
          ['kyoto', 9, 13],
          ['kanazawa', 12, 17],
          ['tokyo', 17, 20],
        ),
      }),
      [{ _tag: 'Overlap', from: december(12), to: december(13) }],
    ],
    [
      'ending outside Tokyo',
      brokenOption1({
        stays: stays(['tokyo', 6, 9], ['kyoto', 9, 13], ['kanazawa', 13, 20]),
      }),
      [{ _tag: 'EndsOutsideTokyo', base: 'kanazawa' }],
    ],
    [
      'not waking up in Kyoto on December 11',
      brokenOption1({
        stays: stays(
          ['tokyo', 6, 11],
          ['kyoto', 11, 13],
          ['kanazawa', 13, 17],
          ['tokyo', 17, 20],
        ),
      }),
      [{ _tag: 'NotWakingUpInKyoto', base: 'tokyo' }],
    ],
    [
      'a Stay without nights',
      brokenOption1({
        stays: stays(
          ['tokyo', 6, 9],
          ['kyoto', 9, 13],
          ['hakone', 13, 13],
          ['kanazawa', 13, 17],
          ['tokyo', 17, 20],
        ),
      }),
      [{ _tag: 'StayWithoutNights', checkIn: december(13) }],
    ],
    [
      'not covering December 6 to December 20',
      brokenOption1({
        stays: stays(
          ['tokyo', 7, 9],
          ['kyoto', 9, 13],
          ['kanazawa', 13, 17],
          ['tokyo', 17, 21],
        ),
      }),
      [
        {
          _tag: 'NotTheTripDates',
          checkIn: december(7),
          checkOut: december(21),
        },
      ],
    ],
    ['no Stays', brokenOption1({ stays: [] }), [{ _tag: 'NoStays' }]],
    [
      'Days other than the 15 Trip Days',
      brokenOption1({ days: option1.days.slice(1) }),
      [
        {
          _tag: 'NotTheTripDays',
          dates: option1.days.slice(1).map((day) => day.date),
        },
      ],
    ],
  ]

  for (const [reason, content, breaks] of cases) {
    it.effect(`fails an Itinerary with ${reason}`, () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* ruleBreaksOf(content), breaks)
      }),
    )
  }
})

describe('Itinerary content version', () => {
  const versionOf = (content: ItineraryContent) =>
    Trip.use((trip) => trip.itinerary(content.optionNumber)).pipe(
      Effect.map((itinerary) => itinerary.contentVersion),
      Effect.provide(tripWith([content])),
    )

  /** The same data with every object's keys in reverse order. */
  const reencoded = (content: ItineraryContent): ItineraryContent =>
    JSON.parse(
      JSON.stringify(content, (_key, value: unknown) =>
        Predicate.isObject(value) && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    )

  it.effect('stays the same when the data is re-encoded', () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* versionOf(reencoded(option1)),
        yield* versionOf(option1),
      )
    }),
  )

  it.effect('changes when any field changes', () =>
    Effect.gen(function* () {
      const original = yield* versionOf(option1)
      const changed: ReadonlyArray<ItineraryContent> = [
        brokenOption1({ name: 'Kyoto + Kanazawa, revised' }),
        brokenOption1({
          days: option1.days.map((day) =>
            day.date === december(14)
              ? { ...day, description: 'Kenrokuen.' }
              : day,
          ),
        }),
        brokenOption1({
          stays: option1.stays.map((stay, index) =>
            index === 2 ? { ...stay, base: 'hakone' } : stay,
          ),
        }),
        brokenOption1({
          shigeharuVisit: { date: december(10), slot: 'morning' },
        }),
      ]
      for (const content of changed) {
        assert.notStrictEqual(yield* versionOf(content), original)
      }
    }),
  )
})
