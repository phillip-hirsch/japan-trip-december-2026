// Every real Itinerary, read back through the Trip service and checked against
// what docs/itinerary.md says about it.
import { assert, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { december } from '@/trip/domain'
import type {
  AccommodationKind,
  IsoDate,
  ItineraryReasoning,
  MoveMode,
  RailSectionMode,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { Trip } from '@/trip/Trip'

const liveTrip = Trip.layer.pipe(Layer.provide(Itineraries.layer))

interface ExpectedItinerary {
  readonly optionNumber: number
  readonly name: string
  readonly recommended: boolean
  readonly bestFor: string
  /** Each Base as "kanji (romaji)", joined by arrows. */
  readonly route: string
  readonly nightsPerBase: ReadonlyArray<readonly [base: string, nights: number]>
  readonly newToYou: ReadonlyArray<string>
  readonly reasoning: ItineraryReasoning
  readonly stays: ReadonlyArray<{
    readonly base: string
    readonly kanji: string
    readonly newPlace: boolean
    /** Check-in and check-out days of December. */
    readonly dates: readonly [number, number]
    readonly nights: number
    readonly accommodation: AccommodationKind
    readonly highlights: ReadonlyArray<string>
  }>
  /** Each of the 15 Days of December with its source description, if any. */
  readonly days: ReadonlyArray<readonly [day: number, description?: string]>
  readonly freeDays: ReadonlyArray<number>
  readonly moves: ReadonlyArray<{
    readonly day: number
    readonly mode: MoveMode
    readonly from: string
    readonly to: string
    readonly sections: ReadonlyArray<
      readonly [mode: RailSectionMode, line: string, from: string, to: string]
    >
    readonly minutes?: readonly [min: number, max: number]
    readonly changes: ReadonlyArray<string>
  }>
  readonly dayTrips: ReadonlyArray<{
    readonly day: number
    readonly place: string
    readonly optional: boolean
  }>
  /** Each Verify claim as where it's attached, its id and its text. */
  readonly verifyClaims: ReadonlyArray<
    readonly [attachedTo: string, id: string, text: string]
  >
  readonly thursdayBackup: boolean
}

const shigeharuClaim = [
  'Day 11',
  'shigeharu-opening-days',
  'Recent visitor reports favor Friday mornings, with occasional Thursday openings, but this remains an observed pattern rather than a confirmed December schedule. Keep that morning flexible and have your agent or hotel confirm directly.',
] as const

const tokyoToKyoto = {
  mode: 'train',
  from: 'Tokyo',
  to: 'Kyoto',
  sections: [['shinkansen', 'tokaido-shinkansen', 'Tokyo', 'Kyoto']],
  // "Tokyo–Kyoto is approximately 2¼ hours", from Option 1's travel notes.
  minutes: [135, 135],
  changes: [],
} as const

const expectedItineraries: ReadonlyArray<ExpectedItinerary> = [
  {
    optionNumber: 1,
    name: 'Kyoto + Kanazawa',
    recommended: true,
    bestFor: 'Best overall balance of discovery, food, and Shigeharu',
    route: '東京 (Tokyo) → 京都 (Kyoto) → 金沢 (Kanazawa) → 東京 (Tokyo)',
    nightsPerBase: [
      ['Tokyo', 6],
      ['Kyoto', 4],
      ['Kanazawa', 4],
    ],
    newToYou: ['Kamakura', 'Uji', 'Kanazawa', 'Enoshima'],
    reasoning: {
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
      whyRecommended:
        'It makes the trip feel different from your previous visits while giving the knife shop appropriate attention. You get one new city in depth, a relaxed return to Kyoto, and Tokyo time at both ends.',
      travelNotes:
        'Tokyo–Kyoto is approximately 2¼ hours by fast shinkansen; Kyoto–Kanazawa roughly two hours with a change at Tsuruga; Kanazawa–Tokyo approximately 2½ hours. Each move comfortably fits into a half-day once hotel transfers are included.',
    },
    stays: [
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [6, 9],
        nights: 3,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Kyoto',
        kanji: '京都',
        newPlace: false,
        dates: [9, 13],
        nights: 4,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Kanazawa',
        kanji: '金沢',
        newPlace: true,
        dates: [13, 17],
        nights: 4,
        accommodation: 'hotel',
        highlights: [
          'Kenrokuen',
          'the castle grounds',
          'Higashi Chaya',
          'craft shops',
          'Omicho Market',
        ],
      },
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [17, 20],
        nights: 3,
        accommodation: 'hotel',
        highlights: [],
      },
    ],
    days: [
      [6, 'Arrival evening.'],
      [7, 'A recovery day.'],
      [8, 'Kamakura.'],
      [9, 'Arrive Wednesday.'],
      [10, 'Keep Thursday flexible.'],
      [11, 'Friday morning for Shigeharu.'],
      [12, 'Uji or a leisurely Kyoto day.'],
      [13],
      [14],
      [15, 'Your birthday dinner.'],
      [16],
      [17],
      [18, 'Optional Enoshima afternoon/evening.'],
      [19, 'Shopping and relaxing.'],
      [20],
    ],
    freeDays: [14, 16],
    moves: [
      { day: 9, ...tokyoToKyoto },
      {
        day: 13,
        mode: 'train',
        from: 'Kyoto',
        to: 'Kanazawa',
        sections: [
          ['limited-express', 'thunderbird', 'Kyoto', 'Tsuruga'],
          ['shinkansen', 'hokuriku-shinkansen', 'Tsuruga', 'Kanazawa'],
        ],
        minutes: [120, 120],
        changes: ['Tsuruga'],
      },
      {
        day: 17,
        mode: 'train',
        from: 'Kanazawa',
        to: 'Tokyo',
        sections: [['shinkansen', 'hokuriku-shinkansen', 'Kanazawa', 'Tokyo']],
        minutes: [150, 150],
        changes: [],
      },
    ],
    dayTrips: [
      { day: 8, place: 'Kamakura', optional: false },
      { day: 12, place: 'Uji', optional: true },
      { day: 18, place: 'Enoshima', optional: true },
    ],
    verifyClaims: [
      [
        'Stay 13',
        'kanazawa-crab-season',
        'December also falls within local crab season, which makes a special seafood dinner an appealing birthday plan.',
      ],
      [
        'Stay 13',
        'kanazawa-snow',
        'Kanazawa can be wet and wintry; snow during your dates is possible, not guaranteed.',
      ],
      shigeharuClaim,
    ],
    thursdayBackup: true,
  },
  {
    optionNumber: 2,
    name: 'Kyoto + Hakone',
    recommended: false,
    bestFor: 'A relaxing birthday retreat',
    route: '東京 (Tokyo) → 京都 (Kyoto) → 箱根 (Hakone) → 東京 (Tokyo)',
    nightsPerBase: [
      ['Tokyo', 7],
      ['Kyoto', 4],
      ['Hakone', 3],
    ],
    newToYou: ['Kamakura', 'Uji', 'Hakone', 'Enoshima'],
    reasoning: {
      birthdayOutline:
        'Breakfast, hot springs, a short walk, more relaxation, and dinner at the ryokan. December 16 can be your sightseeing day—perhaps the Open-Air Museum or a lake/ropeway outing, depending on conditions.',
      pros: [
        'The most deliberate, relaxing birthday experience.',
        'Shigeharu fits naturally before the ryokan stay.',
        'Three nights in Hakone provide two full days without packing.',
        'Good balance of city time and a quieter setting.',
      ],
      cons: [
        'Less exploration of a new urban destination than Options 1 or 4.',
        'Three ryokan nights can take a substantial share of the budget.',
        'Best suited to someone who enjoys bathing, leisurely meals, and time at the accommodation.',
        'Nikko is omitted.',
      ],
      chooseThisIf:
        'your ideal birthday is a retreat, and that matters more than discovering another city.',
      travelNotes:
        'Hakone fits on the return toward Tokyo through Odawara. Allow approximately 3½–4½ hours hotel to hotel from Kyoto, depending on the train connection and ryokan location.',
    },
    stays: [
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [6, 10],
        nights: 4,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Kyoto',
        kanji: '京都',
        newPlace: false,
        dates: [10, 14],
        nights: 4,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Hakone',
        kanji: '箱根',
        newPlace: true,
        dates: [14, 17],
        nights: 3,
        accommodation: 'ryokan',
        highlights: [],
      },
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [17, 20],
        nights: 3,
        accommodation: 'hotel',
        highlights: [],
      },
    ],
    days: [
      [6, 'Arrival.'],
      [7, 'Recovery.'],
      [8, 'Kamakura.'],
      [9, 'An easy Tokyo day.'],
      [10, 'Arrive Thursday.'],
      [11, 'Target Shigeharu Friday morning.'],
      [12, 'Leave the weekend lightly planned, with optional Uji.'],
      [13, 'Leave the weekend lightly planned, with optional Uji.'],
      [14, 'Arrive the day before your birthday.'],
      [
        15,
        'Breakfast, hot springs, a short walk, more relaxation, and dinner at the ryokan.',
      ],
      [
        16,
        'Your sightseeing day—perhaps the Open-Air Museum or a lake/ropeway outing, depending on conditions.',
      ],
      [17],
      [18],
      [19],
      [20],
    ],
    freeDays: [],
    moves: [
      { day: 10, ...tokyoToKyoto },
      {
        day: 14,
        mode: 'train',
        from: 'Kyoto',
        to: 'Hakone',
        sections: [['shinkansen', 'tokaido-shinkansen', 'Kyoto', 'Odawara']],
        minutes: [210, 270],
        changes: [],
      },
      // The source never says how long Hakone–Tokyo takes.
      {
        day: 17,
        mode: 'train',
        from: 'Hakone',
        to: 'Tokyo',
        sections: [],
        changes: [],
      },
    ],
    dayTrips: [
      { day: 8, place: 'Kamakura', optional: false },
      { day: 12, place: 'Uji', optional: true },
      { day: 13, place: 'Uji', optional: true },
      { day: 18, place: 'Enoshima', optional: true },
      { day: 19, place: 'Enoshima', optional: true },
    ],
    verifyClaims: [shigeharuClaim],
    thursdayBackup: false,
  },
  {
    optionNumber: 3,
    name: 'Tokyo + Kyoto',
    recommended: false,
    bestFor: 'Fewest moves and all three suggested day trips',
    route: '東京 (Tokyo) → 京都 (Kyoto) → 東京 (Tokyo)',
    nightsPerBase: [
      ['Tokyo', 10],
      ['Kyoto', 4],
    ],
    newToYou: ['Kamakura', 'Nikko', 'Enoshima'],
    reasoning: {
      birthdayOutline:
        'Sleep in, choose one enjoyable activity, and reserve a special dinner. You have no travel obligation that day.',
      pros: [
        'Only two hotel moves.',
        'Includes Kamakura, Enoshima, Nikko, and the Shigeharu opportunity.',
        'Easy to rearrange excursions around weather and energy.',
        'Plenty of time to explore Tokyo beyond places you’ve already seen.',
      ],
      cons: [
        'Every overnight base is somewhere you have already visited.',
        'Several day trips still involve considerable train time, especially Nikko.',
        'No ryokan retreat or extended stay in a new region.',
      ],
      chooseThisIf:
        'freedom and minimal packing matter more than staying somewhere new.',
    },
    stays: [
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [6, 9],
        nights: 3,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Kyoto',
        kanji: '京都',
        newPlace: false,
        dates: [9, 13],
        nights: 4,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [13, 20],
        nights: 7,
        accommodation: 'hotel',
        highlights: [],
      },
    ],
    days: [
      [6, 'Arrival.'],
      [7, 'Jet-lag recovery.'],
      [8, 'Relaxed neighborhood time.'],
      [9],
      [10, 'Thursday flexibility.'],
      [11, 'Friday morning for Shigeharu.'],
      [12, 'An easy Saturday.'],
      [13],
      [14, 'Kamakura.'],
      [15, 'Birthday in Tokyo.'],
      [16, 'Nikko.'],
      // "Unscheduled Tokyo day": deliberately left unplanned.
      [17],
      [18, 'Enoshima afternoon and evening.'],
      [19, 'Shopping, favorite food, and packing.'],
      [20],
    ],
    freeDays: [17],
    moves: [
      { day: 9, ...tokyoToKyoto },
      {
        day: 13,
        mode: 'train',
        from: 'Kyoto',
        to: 'Tokyo',
        sections: [['shinkansen', 'tokaido-shinkansen', 'Kyoto', 'Tokyo']],
        minutes: [135, 135],
        changes: [],
      },
    ],
    dayTrips: [
      { day: 14, place: 'Kamakura', optional: false },
      { day: 16, place: 'Nikko', optional: false },
      { day: 18, place: 'Enoshima', optional: false },
    ],
    verifyClaims: [
      shigeharuClaim,
      [
        'Day 16',
        'nikko-toshogu-winter-hours',
        'Toshogu closes at 16:00 in winter.',
      ],
      [
        'Day 18',
        'enoshima-winter-illumination',
        'Enoshima’s announced winter illumination dates cover your trip, making it a good afternoon-and-evening excursion.',
      ],
    ],
    thursdayBackup: true,
  },
  {
    optionNumber: 4,
    name: 'Kyoto + Fukuoka',
    recommended: false,
    bestFor: 'Exploring another region and eating exceptionally well',
    route: '東京 (Tokyo) → 京都 (Kyoto) → 福岡 (Fukuoka) → 東京 (Tokyo)',
    nightsPerBase: [
      ['Tokyo', 6],
      ['Kyoto', 4],
      ['Fukuoka', 4],
    ],
    newToYou: ['Kamakura', 'Fukuoka', 'Dazaifu', 'Enoshima'],
    reasoning: {
      birthdayOutline:
        'A leisurely Fukuoka day followed by a reserved sushi or other special dinner.',
      pros: [
        'Introduces you to Kyushu while preserving the knife-shopping opportunity.',
        'Excellent for a trip centered on food and relaxed city exploration.',
        'Four nights give you time to enjoy Fukuoka without constant excursions.',
        'Only one domestic flight.',
      ],
      cons: [
        'More airport logistics than the other options.',
        'Less of a traditional garden-and-historic-district experience than Kanazawa.',
        'No dedicated onsen stay.',
        'Nagasaki is excluded to preserve downtime and limit hotel changes.',
      ],
      chooseThisIf:
        'regional food and exploring another major city excite you more than gardens, crafts, or a ryokan.',
      travelNotes:
        'Kyoto–Hakata takes approximately 2 hours 45 minutes by shinkansen. Fly Fukuoka–Haneda on December 17, leaving three nights in Tokyo before your international flight.',
    },
    stays: [
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [6, 9],
        nights: 3,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Kyoto',
        kanji: '京都',
        newPlace: false,
        dates: [9, 13],
        nights: 4,
        accommodation: 'hotel',
        highlights: [],
      },
      {
        base: 'Fukuoka',
        kanji: '福岡',
        newPlace: true,
        dates: [13, 17],
        nights: 4,
        accommodation: 'hotel',
        highlights: [
          'Ohori Park',
          'cafés',
          'shopping',
          'ramen',
          'seafood',
          'an evening at the yatai stalls',
        ],
      },
      {
        base: 'Tokyo',
        kanji: '東京',
        newPlace: false,
        dates: [17, 20],
        nights: 3,
        accommodation: 'hotel',
        highlights: [],
      },
    ],
    days: [
      [6, 'Arrival.'],
      [7, 'Recovery.'],
      [8, 'Optional Kamakura.'],
      [9],
      [10, 'Thursday flexibility.'],
      [11, 'Friday morning for Shigeharu.'],
      [12, 'A relaxed weekend.'],
      [13, 'A relaxed weekend.'],
      [14],
      [15, 'Birthday dinner.'],
      [16, 'Dazaifu, for the shrine and surrounding streets.'],
      [17, 'Fly back.'],
      [18, 'Leave room for Enoshima.'],
      // "A free final day": deliberately left unplanned.
      [19],
      [20],
    ],
    freeDays: [14, 19],
    moves: [
      { day: 9, ...tokyoToKyoto },
      {
        day: 13,
        mode: 'train',
        from: 'Kyoto',
        to: 'Fukuoka',
        sections: [
          ['shinkansen', 'tokaido-sanyo-shinkansen', 'Kyoto', 'Hakata'],
        ],
        minutes: [165, 165],
        changes: [],
      },
      // The source never says how long the flight takes.
      {
        day: 17,
        mode: 'flight',
        from: 'Fukuoka',
        to: 'Tokyo',
        sections: [],
        changes: [],
      },
    ],
    dayTrips: [
      { day: 8, place: 'Kamakura', optional: true },
      { day: 16, place: 'Dazaifu', optional: true },
      { day: 18, place: 'Enoshima', optional: true },
    ],
    verifyClaims: [shigeharuClaim],
    thursdayBackup: true,
  },
]

layer(liveTrip)('The Itinerary catalogue', (it) => {
  it.effect('holds Options 1 to 4, each with its name', () =>
    Effect.gen(function* () {
      const itineraries = yield* Trip.use((trip) => trip.itineraries)
      assert.deepStrictEqual(
        itineraries.map(({ optionNumber, name }) => [optionNumber, name]),
        expectedItineraries.map(({ optionNumber, name }) => [
          optionNumber,
          name,
        ]),
      )
    }),
  )
})

/** A date in December as its day of the month. */
const dayOfMonth = (date: IsoDate) => Number(date.slice(-2))

for (const expected of expectedItineraries) {
  layer(liveTrip)(`Option ${expected.optionNumber}`, (it) => {
    const detail = Trip.use((trip) => trip.itinerary(expected.optionNumber))

    it.effect('has its name, recommendation and Best for', () =>
      Effect.gen(function* () {
        const { optionNumber, name, recommended, bestFor } = yield* detail
        assert.deepStrictEqual(
          { optionNumber, name, recommended, bestFor },
          {
            optionNumber: expected.optionNumber,
            name: expected.name,
            recommended: expected.recommended,
            bestFor: expected.bestFor,
          },
        )
      }),
    )

    it.effect('routes through each Base in kanji and romaji', () =>
      Effect.gen(function* () {
        const { route } = yield* detail
        assert.strictEqual(
          route.map(({ kanji, romaji }) => `${kanji} (${romaji})`).join(' → '),
          expected.route,
        )
      }),
    )

    it.effect('spreads its 14 nights across its Bases', () =>
      Effect.gen(function* () {
        const { nightsPerBase } = yield* detail
        assert.deepStrictEqual<ExpectedItinerary['nightsPerBase']>(
          nightsPerBase.map(({ base, nights }) => [base.romaji, nights]),
          expected.nightsPerBase,
        )
      }),
    )

    it.effect(
      'is New to you in its Bases and Day trips, optional ones too',
      () =>
        Effect.gen(function* () {
          const { newToYou } = yield* detail
          assert.deepStrictEqual(
            newToYou.map((place) => place.romaji),
            expected.newToYou,
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
        } = yield* detail
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
            chooseThisIf: undefined,
            whyRecommended: undefined,
            travelNotes: undefined,
            ...expected.reasoning,
          },
        )
      }),
    )

    it.effect('has back-to-back Stays with their highlights and kind', () =>
      Effect.gen(function* () {
        const { stays } = yield* detail
        assert.deepStrictEqual<ExpectedItinerary['stays']>(
          stays.map((stay) => ({
            base: stay.base.romaji,
            kanji: stay.base.kanji,
            newPlace: stay.base.newPlace,
            dates: [dayOfMonth(stay.checkIn), dayOfMonth(stay.checkOut)],
            nights: stay.nights,
            accommodation: stay.accommodation,
            highlights: stay.highlights,
          })),
          expected.stays,
        )
      }),
    )

    it.effect('describes only the Days the source describes', () =>
      Effect.gen(function* () {
        const { days } = yield* detail
        assert.deepStrictEqual(
          days.map(({ date, description }) =>
            description === undefined ? [date] : ([date, description] as const),
          ),
          expected.days.map(([day, description]) =>
            description === undefined
              ? [december(day)]
              : ([december(day), description] as const),
          ),
        )
      }),
    )

    it.effect('marks its Free days', () =>
      Effect.gen(function* () {
        const { days } = yield* detail
        assert.deepStrictEqual(
          days.filter((day) => day.freeDay).map((day) => day.date),
          expected.freeDays.map(december),
        )
      }),
    )

    it.effect('travels on each Move day between the Stays that meet', () =>
      Effect.gen(function* () {
        const { days } = yield* detail
        assert.deepStrictEqual<ExpectedItinerary['moves']>(
          days.flatMap(({ date, move }) =>
            move
              ? [
                  {
                    day: dayOfMonth(date),
                    mode: move.mode,
                    from: move.from.romaji,
                    to: move.to.romaji,
                    sections: move.sections.map((section) => [
                      section.mode,
                      section.line,
                      section.from.name,
                      section.to.name,
                    ]),
                    ...(move.duration && {
                      minutes: [
                        move.duration.minMinutes,
                        move.duration.maxMinutes,
                      ],
                    }),
                    changes: move.changes.map((station) => station.name),
                  },
                ]
              : [],
          ),
          expected.moves,
        )
      }),
    )

    it.effect('marks Day trips, optional ones included, as New places', () =>
      Effect.gen(function* () {
        const { days } = yield* detail
        assert.deepStrictEqual(
          days.flatMap(({ date, dayTrips }) =>
            dayTrips.map(({ place, optional }) => ({
              day: dayOfMonth(date),
              place: place.romaji,
              optional,
              newPlace: place.newPlace,
            })),
          ),
          // Every Day trip destination so far is somewhere new.
          expected.dayTrips.map((dayTrip) => ({ ...dayTrip, newPlace: true })),
        )
      }),
    )

    it.effect('attaches each Verify claim to its Day, Stay or Itinerary', () =>
      Effect.gen(function* () {
        const { verifyClaims, stays, days } = yield* detail
        assert.deepStrictEqual<ExpectedItinerary['verifyClaims']>(
          [
            ...verifyClaims.map(
              ({ id, text }) => ['Itinerary', id, text] as const,
            ),
            ...stays.flatMap((stay) =>
              stay.verifyClaims.map(
                ({ id, text }) =>
                  [`Stay ${dayOfMonth(stay.checkIn)}`, id, text] as const,
              ),
            ),
            ...days.flatMap((day) =>
              day.verifyClaims.map(
                ({ id, text }) =>
                  [`Day ${dayOfMonth(day.date)}`, id, text] as const,
              ),
            ),
          ],
          expected.verifyClaims,
        )
      }),
    )

    it.effect('marks the Anchors on their Days', () =>
      Effect.gen(function* () {
        const { days } = yield* detail
        assert.deepStrictEqual(
          days.flatMap((day) => day.anchors),
          [
            { _tag: 'Arrival', date: december(6) },
            {
              _tag: 'ShigeharuVisit',
              date: december(11),
              slot: 'morning',
              tentative: true,
              thursdayBackup: expected.thursdayBackup,
            },
            { _tag: 'Birthday', date: december(15) },
            { _tag: 'Departure', date: december(20) },
          ],
        )
      }),
    )

    it.effect('has no citation markers left in its text', () =>
      Effect.gen(function* () {
        assert.notMatch(
          JSON.stringify(yield* detail),
          /content-reference|chatgpt|【|†|\[\d+\]/,
        )
      }),
    )
  })
}
