import { assert, describe, it, layer } from '@effect/vitest'
import { DateTime, Effect, Layer, Predicate, Struct } from 'effect'
import { TestClock } from 'effect/testing'

import { december } from '@/trip/domain'
import type {
  ItineraryContent,
  MoveSummary,
  TripRuleBreak,
} from '@/trip/domain'
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
  it.effect('lists every Itinerary in the catalogue', () =>
    Effect.gen(function* () {
      const home = yield* homeAt('2026-10-01T00:00:00Z')
      const itineraries = yield* Trip.use((trip) => trip.itineraries).pipe(
        Effect.provide(liveTrip),
      )
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

  it.effect('has exactly one recommended by gpt-6-astra', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      const itineraries = yield* trip.itineraries
      assert.strictEqual(
        itineraries.filter((itinerary) => itinerary.recommended).length,
        1,
      )
    }),
  )
})

layer(liveTrip)('Trip.itinerary', (it) => {
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
const option1With = (changes: Partial<ItineraryContent>): ItineraryContent => ({
  ...option1,
  ...changes,
})

/**
 * Stays over the given nights, with a train Move at each Stay boundary and
 * none of Option 1's Verify claims, which belong to its own Stays.
 */
const withStays = (
  ...ranges: ReadonlyArray<
    readonly [base: ItineraryContent['stays'][number]['base'], number, number]
  >
): Pick<ItineraryContent, 'stays' | 'moves' | 'verifyClaims'> => ({
  stays: ranges.map(([base, checkIn, checkOut]) => ({
    base,
    checkIn: december(checkIn),
    checkOut: december(checkOut),
    accommodation: 'hotel',
    highlights: [],
  })),
  moves: ranges
    .slice(1)
    .flatMap(([, checkIn], index) =>
      ranges[index]?.[2] === checkIn
        ? [{ date: december(checkIn), mode: 'train', sections: [] }]
        : [],
    ),
  verifyClaims: [],
})

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
      option1With({ shigeharuVisit: undefined }),
      [{ _tag: 'ShigeharuMissing' }],
    ],
    [
      'Shigeharu on the wrong date',
      option1With({
        shigeharuVisit: { date: december(12), slot: 'morning' },
      }),
      [{ _tag: 'ShigeharuWrongDate', date: december(12) }],
    ],
    [
      'Shigeharu not in the morning',
      option1With({
        shigeharuVisit: { date: december(11), slot: 'afternoon' },
      }),
      [{ _tag: 'ShigeharuNotInMorning', slot: 'afternoon' }],
    ],
    [
      'a Move on December 15',
      option1With({
        ...withStays(
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
      option1With({
        ...withStays(
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
      option1With({
        ...withStays(
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
      option1With({
        ...withStays(['tokyo', 6, 9], ['kyoto', 9, 13], ['kanazawa', 13, 20]),
      }),
      [{ _tag: 'EndsOutsideTokyo', base: 'kanazawa' }],
    ],
    [
      'not waking up in Kyoto on December 11',
      option1With({
        ...withStays(
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
      option1With({
        ...withStays(
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
      option1With({
        ...withStays(
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
    ['no Stays', option1With(withStays()), [{ _tag: 'NoStays' }]],
    [
      'a Move where no Stays meet',
      option1With({
        moves: [
          ...option1.moves,
          { date: december(11), mode: 'local', sections: [] },
        ],
      }),
      [{ _tag: 'MoveWithoutStayBoundary', date: december(11) }],
    ],
    [
      'Stays that meet without a Move',
      option1With({
        moves: option1.moves.filter((move) => move.date !== december(13)),
      }),
      [{ _tag: 'StayBoundaryWithoutMove', date: december(13) }],
    ],
    [
      'a Verify claim attached to no Stay',
      option1With({
        verifyClaims: [
          {
            id: 'kyoto-crowds',
            text: 'Kyoto is quieter in December.',
            attachedTo: { _tag: 'Stay', checkIn: december(10) },
          },
        ],
      }),
      [{ _tag: 'UnattachedVerifyClaim', id: 'kyoto-crowds' }],
    ],
    [
      'a Verify claim attached to no Day',
      option1With({
        verifyClaims: [
          {
            id: 'late-checkout',
            text: 'Late checkout is free.',
            attachedTo: { _tag: 'Day', date: december(21) },
          },
        ],
      }),
      [{ _tag: 'UnattachedVerifyClaim', id: 'late-checkout' }],
    ],
    [
      'Days other than the 15 Trip Days',
      option1With({ days: option1.days.slice(1) }),
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

describe('Free days', () => {
  it.effect('are not Days with a Day trip', () =>
    Effect.gen(function* () {
      const { days } = yield* Trip.use((trip) => trip.itinerary(1)).pipe(
        Effect.provide(
          tripWith([
            option1With({
              dayTrips: [
                ...option1.dayTrips,
                { date: december(14), place: 'kamakura', optional: true },
              ],
            }),
          ]),
        ),
      )
      assert.deepStrictEqual(
        days.filter((day) => day.freeDay).map((day) => day.date),
        [december(16)],
      )
    }),
  )
})

describe('Route', () => {
  it.effect('names a Base once when back-to-back Stays share it', () =>
    Effect.gen(function* () {
      const { route } = yield* Trip.use((trip) => trip.itinerary(1)).pipe(
        Effect.provide(
          tripWith([
            option1With({
              ...withStays(
                ['tokyo', 6, 9],
                ['kyoto', 9, 13],
                ['kanazawa', 13, 17],
                ['tokyo', 17, 18],
                ['tokyo', 18, 20],
              ),
            }),
          ]),
        ),
      )
      assert.deepStrictEqual(
        route.map((place) => place.romaji),
        ['Tokyo', 'Kyoto', 'Kanazawa', 'Tokyo'],
      )
    }),
  )
})

describe('New to you', () => {
  it.effect('names a New place once, however often the Trip goes there', () =>
    Effect.gen(function* () {
      const { newToYou } = yield* Trip.use((trip) => trip.itinerary(1)).pipe(
        Effect.provide(
          tripWith([
            option1With({
              dayTrips: [
                ...option1.dayTrips,
                { date: december(19), place: 'kamakura', optional: false },
              ],
            }),
          ]),
        ),
      )
      assert.deepStrictEqual(
        newToYou.map((place) => place.romaji),
        ['Kamakura', 'Uji', 'Kanazawa', 'Enoshima'],
      )
    }),
  )
})

describe('Verify claims', () => {
  it.effect('can be attached to the Itinerary as a whole', () =>
    Effect.gen(function* () {
      const { verifyClaims } = yield* Trip.use((trip) =>
        trip.itinerary(1),
      ).pipe(
        Effect.provide(
          tripWith([
            option1With({
              verifyClaims: [
                {
                  id: 'rail-pass',
                  text: 'Rail pass prices change in October.',
                  attachedTo: { _tag: 'Itinerary' },
                },
              ],
            }),
          ]),
        ),
      )
      assert.deepStrictEqual(verifyClaims, [
        { id: 'rail-pass', text: 'Rail pass prices change in October.' },
      ])
    }),
  )
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
        option1With({ name: 'Kyoto + Kanazawa, revised' }),
        option1With({ bestFor: 'Crab season' }),
        option1With({ recommended: false }),
        option1With({ cons: [...option1.cons, 'Long train days.'] }),
        option1With({ chooseThisIf: 'you want gardens and crafts.' }),
        option1With({
          days: option1.days.map((day) =>
            day.date === december(14)
              ? { ...day, description: 'Kenrokuen.' }
              : day,
          ),
        }),
        option1With({
          stays: option1.stays.map((stay, index) =>
            index === 2 ? { ...stay, base: 'hakone' } : stay,
          ),
        }),
        option1With({
          shigeharuVisit: { date: december(10), slot: 'morning' },
        }),
        option1With({
          stays: option1.stays.map((stay) => ({
            ...stay,
            highlights: [...stay.highlights, 'Gold leaf ice cream'],
          })),
        }),
        option1With({
          moves: option1.moves.map((move) => ({
            ...move,
            duration: { minMinutes: 120, maxMinutes: 180 },
          })),
        }),
        option1With({
          dayTrips: option1.dayTrips.map((dayTrip) => ({
            ...dayTrip,
            optional: !dayTrip.optional,
          })),
        }),
        option1With({
          verifyClaims: option1.verifyClaims.map((claim) => ({
            ...claim,
            text: `${claim.text} Confirmed.`,
          })),
        }),
      ]
      for (const content of changed) {
        assert.notStrictEqual(yield* versionOf(content), original)
      }
    }),
  )
})

describe('Comparison rows', () => {
  const comparisonOf = (content: ItineraryContent) =>
    Trip.use((trip) => trip.itineraries).pipe(
      Effect.map(([itinerary]) => itinerary),
      Effect.provide(tripWith([content])),
    )

  /** A Move as "date mode from → to". */
  const describeMove = ({ date, mode, from, to }: MoveSummary) =>
    `${date} ${mode} ${from.romaji} → ${to.romaji}`

  it.effect('leave a Move with no duration out of the travel time', () =>
    Effect.gen(function* () {
      const compared = yield* comparisonOf(
        option1With({
          moves: option1.moves.map(({ duration, ...move }) =>
            move.date === december(13) ? move : { ...move, duration },
          ),
        }),
      )
      assert.deepStrictEqual(
        {
          count: compared?.moves.count,
          travelTime: compared?.moves.travelTime,
          durationNotGiven: compared?.moves.durationNotGiven.map(describeMove),
        },
        {
          count: 3,
          // Tokyo–Kyoto's 2¼ hours plus Kanazawa–Tokyo's 2½ hours.
          travelTime: { minMinutes: 285, maxMinutes: 285 },
          durationNotGiven: ['2026-12-13 train Kyoto → Kanazawa'],
        },
      )
    }),
  )

  it.effect('give no travel time when no Move has a duration', () =>
    Effect.gen(function* () {
      const compared = yield* comparisonOf(
        option1With({
          moves: option1.moves.map(({ date, mode, sections }) => ({
            date,
            mode,
            sections,
          })),
        }),
      )
      assert.deepStrictEqual(
        {
          count: compared?.moves.count,
          travelTime: compared?.moves.travelTime,
          durationNotGiven: compared?.moves.durationNotGiven.map(describeMove),
        },
        {
          count: 3,
          travelTime: undefined,
          durationNotGiven: [
            '2026-12-09 train Tokyo → Kyoto',
            '2026-12-13 train Kyoto → Kanazawa',
            '2026-12-17 train Kanazawa → Tokyo',
          ],
        },
      )
    }),
  )

  it.effect('count a local Move but never ask for its duration', () =>
    Effect.gen(function* () {
      const stays = withStays(
        ['tokyo', 6, 9],
        ['kyoto', 9, 13],
        ['kanazawa', 13, 17],
        ['tokyo', 17, 18],
        ['tokyo', 18, 20],
      )
      const compared = yield* comparisonOf(
        option1With({
          ...stays,
          moves: stays.moves.map((move) =>
            move.date === december(18) ? { ...move, mode: 'local' } : move,
          ),
        }),
      )
      assert.deepStrictEqual(
        {
          count: compared?.moves.count,
          durationNotGiven: compared?.moves.durationNotGiven.map(describeMove),
        },
        {
          count: 4,
          durationNotGiven: [
            '2026-12-09 train Tokyo → Kyoto',
            '2026-12-13 train Kyoto → Kanazawa',
            '2026-12-17 train Kanazawa → Tokyo',
          ],
        },
      )
    }),
  )

  it.effect(
    'give a Thursday backup only to a Kyoto Stay from December 9 to 11',
    () =>
      Effect.gen(function* () {
        const backupWith = (checkIn: number, checkOut: number) =>
          comparisonOf(
            option1With({
              ...withStays(
                ['tokyo', 6, checkIn],
                ['kyoto', checkIn, checkOut],
                ['tokyo', checkOut, 20],
              ),
            }),
          ).pipe(Effect.map((compared) => compared?.thursdayBackup))
        assert.deepStrictEqual(
          {
            'December 9 to 11': yield* backupWith(9, 11),
            'December 10 to 13': yield* backupWith(10, 13),
            'December 8 to 10': yield* backupWith(8, 10),
          },
          {
            'December 9 to 11': true,
            'December 10 to 13': false,
            'December 8 to 10': false,
          },
        )
      }),
  )

  it.effect('list a Day trip once, optional only when every one is', () =>
    Effect.gen(function* () {
      const compared = yield* comparisonOf(
        option1With({
          dayTrips: [
            ...option1.dayTrips,
            { date: december(19), place: 'enoshima', optional: false },
            { date: december(19), place: 'kamakura', optional: true },
          ],
        }),
      )
      assert.deepStrictEqual(
        compared?.dayTrips.map(
          ({ place, optional }) =>
            `${place.romaji}${optional ? ' (optional)' : ''}`,
        ),
        ['Kamakura', 'Uji (optional)', 'Enoshima'],
      )
    }),
  )
})
