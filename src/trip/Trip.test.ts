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
      assert.deepStrictEqual(
        home.itineraries.map(({ optionNumber, name }) => ({
          optionNumber,
          name,
        })),
        [{ optionNumber: 1, name: 'Kyoto + Kanazawa' }],
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

  it.effect('is gpt-6-astra’s recommendation, best for a balanced trip', () =>
    Effect.gen(function* () {
      const { recommended, bestFor } = yield* option1Detail
      assert.deepStrictEqual(
        { recommended, bestFor },
        {
          recommended: true,
          bestFor: 'Best overall balance of discovery, food, and Shigeharu',
        },
      )
    }),
  )

  it.effect('routes through each Base in kanji and romaji', () =>
    Effect.gen(function* () {
      const { route } = yield* option1Detail
      assert.deepStrictEqual(
        route.map(({ kanji, romaji }) => `${kanji} (${romaji})`).join(' → '),
        '東京 (Tokyo) → 京都 (Kyoto) → 金沢 (Kanazawa) → 東京 (Tokyo)',
      )
    }),
  )

  it.effect('spreads its nights across Bases, Tokyo’s two Stays together', () =>
    Effect.gen(function* () {
      const { nightsPerBase } = yield* option1Detail
      assert.deepStrictEqual(
        nightsPerBase.map(({ base, nights }) => [base.romaji, nights]),
        [
          ['Tokyo', 6],
          ['Kyoto', 4],
          ['Kanazawa', 4],
        ],
      )
    }),
  )

  it.effect('is New to you in its Bases and Day trips, optional ones too', () =>
    Effect.gen(function* () {
      const { newToYou } = yield* option1Detail
      assert.deepStrictEqual(
        newToYou.map((place) => place.romaji),
        ['Kamakura', 'Uji', 'Kanazawa', 'Enoshima'],
      )
    }),
  )

  it.effect('keeps gpt-6-astra’s reasoning', () =>
    Effect.gen(function* () {
      const {
        birthdayOutline,
        pros,
        cons,
        chooseThisIf,
        whyRecommended,
        travelNotes,
      } = yield* option1Detail
      assert.deepStrictEqual(
        {
          birthdayOutline,
          pros,
          cons,
          chooseThisIf,
          whyRecommended,
          travelNotes,
        },
        {
          birthdayOutline:
            'A slow breakfast, a short outing if you feel like it, an afternoon break, and a reserved sushi or seasonal seafood dinner.',
          pros: [
            'A substantial new destination alongside the Shigeharu opportunity.',
            'Four-night stays let you settle in, with room for poor weather or a lazy morning.',
            'An efficient rail loop with no domestic flights.',
            'Particularly strong for food, crafts, and traditional neighborhoods.',
          ],
          cons: [
            'Kanazawa can be wet and wintry; snow during your dates is possible, not guaranteed.',
            'No dedicated hot-spring retreat.',
            'Nikko is omitted; adding it would mean replacing another excursion or giving up downtime.',
          ],
          // The source gives Option 1 no "choose this if", only why it is
          // recommended.
          chooseThisIf: undefined,
          whyRecommended:
            'It makes the trip feel different from your previous visits while giving the knife shop appropriate attention. You get one new city in depth, a relaxed return to Kyoto, and Tokyo time at both ends.',
          travelNotes:
            'Tokyo–Kyoto is approximately 2¼ hours by fast shinkansen; Kyoto–Kanazawa roughly two hours with a change at Tsuruga; Kanazawa–Tokyo approximately 2½ hours. Each move comfortably fits into a half-day once hotel transfers are included.',
        },
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

  it.effect('lists each Stay’s highlights and accommodation kind', () =>
    Effect.gen(function* () {
      const { stays } = yield* option1Detail
      assert.deepStrictEqual(
        stays.map((stay) => [
          stay.base.romaji,
          stay.accommodation,
          stay.highlights,
        ]),
        [
          ['Tokyo', 'hotel', []],
          ['Kyoto', 'hotel', []],
          [
            'Kanazawa',
            'hotel',
            [
              'Kenrokuen',
              'the castle grounds',
              'Higashi Chaya',
              'craft shops',
              'Omicho Market',
            ],
          ],
          ['Tokyo', 'hotel', []],
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

  it.effect('connects the two Stays that meet on each Move day', () =>
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

  it.effect('travels by train on every Move, with its rail sections', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.flatMap(({ move }) =>
          move
            ? [
                {
                  mode: move.mode,
                  sections: move.sections.map((section) => [
                    section.mode,
                    section.line,
                    section.from.name,
                    section.to.name,
                  ]),
                },
              ]
            : [],
        ),
        [
          {
            mode: 'train',
            sections: [['shinkansen', 'tokaido-shinkansen', 'Tokyo', 'Kyoto']],
          },
          {
            mode: 'train',
            sections: [
              ['limited-express', 'thunderbird', 'Kyoto', 'Tsuruga'],
              ['shinkansen', 'hokuriku-shinkansen', 'Tsuruga', 'Kanazawa'],
            ],
          },
          {
            mode: 'train',
            sections: [
              ['shinkansen', 'hokuriku-shinkansen', 'Kanazawa', 'Tokyo'],
            ],
          },
        ],
      )
    }),
  )

  it.effect('gives each Move its duration range and changes of train', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.flatMap(({ date, move }) =>
          move
            ? [
                {
                  date,
                  duration: move.duration,
                  changes: move.changes.map((station) => station.name),
                },
              ]
            : [],
        ),
        [
          {
            date: december(9),
            duration: { minMinutes: 135, maxMinutes: 135 },
            changes: [],
          },
          {
            date: december(13),
            duration: { minMinutes: 120, maxMinutes: 120 },
            changes: ['Tsuruga'],
          },
          {
            date: december(17),
            duration: { minMinutes: 150, maxMinutes: 150 },
            changes: [],
          },
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

  it.effect('marks Day trips, optional ones included, as New places', () =>
    Effect.gen(function* () {
      const { days } = yield* option1Detail
      assert.deepStrictEqual(
        days.flatMap(({ date, dayTrips }) =>
          dayTrips.map(({ place, optional }) => ({
            date,
            place: place.romaji,
            optional,
            newPlace: place.newPlace,
          })),
        ),
        [
          {
            date: december(8),
            place: 'Kamakura',
            optional: false,
            newPlace: true,
          },
          { date: december(12), place: 'Uji', optional: true, newPlace: true },
          {
            date: december(18),
            place: 'Enoshima',
            optional: true,
            newPlace: true,
          },
        ],
      )
    }),
  )

  it.effect('attaches each Verify claim to its Day, Stay or Itinerary', () =>
    Effect.gen(function* () {
      const { verifyClaims, stays, days } = yield* option1Detail
      assert.deepStrictEqual(
        [
          ...verifyClaims.map((claim) => ['Itinerary', claim.id]),
          ...stays.flatMap((stay) =>
            stay.verifyClaims.map((claim) => [
              `${stay.base.romaji} Stay`,
              claim.id,
            ]),
          ),
          ...days.flatMap((day) =>
            day.verifyClaims.map((claim) => [day.date, claim.id]),
          ),
        ],
        [
          ['Kanazawa Stay', 'kanazawa-crab-season'],
          ['Kanazawa Stay', 'kanazawa-snow'],
          [december(11), 'shigeharu-opening-days'],
        ],
      )
    }),
  )

  it.effect('has no citation markers left in its text', () =>
    Effect.gen(function* () {
      const detail = yield* option1Detail
      assert.notMatch(JSON.stringify(detail), /content-reference|【|†|\[\d+\]/)
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
