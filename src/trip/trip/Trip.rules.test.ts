import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import {
  december,
  ItineraryContent,
  TripRuleBreak,
  VerifyClaimAttachment,
} from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { option1With, withStays } from '@/trip/trip/Trip.itinerary.testing'

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
      [TripRuleBreak.cases.ShigeharuMissing.make({})],
    ],
    [
      'Shigeharu on the wrong date',
      option1With({
        shigeharuVisit: { date: december(12), slot: 'morning' },
      }),
      [TripRuleBreak.cases.ShigeharuWrongDate.make({ date: december(12) })],
    ],
    [
      'Shigeharu not in the morning',
      option1With({
        shigeharuVisit: { date: december(11), slot: 'afternoon' },
      }),
      [TripRuleBreak.cases.ShigeharuNotInMorning.make({ slot: 'afternoon' })],
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
      [TripRuleBreak.cases.MoveOnBirthday.make({})],
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
      [TripRuleBreak.cases.Gap.make({ from: december(13), to: december(14) })],
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
      [
        TripRuleBreak.cases.Overlap.make({
          from: december(12),
          to: december(13),
        }),
      ],
    ],
    [
      'ending outside Tokyo',
      option1With({
        ...withStays(['tokyo', 6, 9], ['kyoto', 9, 13], ['kanazawa', 13, 20]),
      }),
      [TripRuleBreak.cases.EndsOutsideTokyo.make({ base: 'kanazawa' })],
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
      [TripRuleBreak.cases.NotWakingUpInKyoto.make({ base: 'tokyo' })],
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
      [
        TripRuleBreak.cases.StayWithoutNights.make({ checkIn: december(13) }),
        TripRuleBreak.cases.MovesOnOneDate.make({ date: december(13) }),
      ],
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
        TripRuleBreak.cases.NotTheTripDates.make({
          checkIn: december(7),
          checkOut: december(21),
        }),
      ],
    ],
    [
      'no Stays',
      option1With(withStays()),
      [TripRuleBreak.cases.NoStays.make({})],
    ],
    [
      'a Move where no Stays meet',
      option1With({
        moves: [
          ...option1.moves,
          { date: december(11), mode: 'local', sections: [] },
        ],
      }),
      [
        TripRuleBreak.cases.MoveWithoutStayBoundary.make({
          date: december(11),
        }),
      ],
    ],
    [
      'two Moves on one date',
      option1With({
        moves: [
          ...option1.moves,
          { date: december(13), mode: 'local', sections: [] },
        ],
      }),
      [TripRuleBreak.cases.MovesOnOneDate.make({ date: december(13) })],
    ],
    [
      'Stays that meet without a Move',
      option1With({
        moves: option1.moves.filter((move) => move.date !== december(13)),
      }),
      [
        TripRuleBreak.cases.StayBoundaryWithoutMove.make({
          date: december(13),
        }),
      ],
    ],
    [
      'a Verify claim attached to no Stay',
      option1With({
        verifyClaims: [
          {
            id: 'kyoto-crowds',
            text: 'Kyoto is quieter in December.',
            attachedTo: VerifyClaimAttachment.cases.Stay.make({
              checkIn: december(10),
            }),
          },
        ],
      }),
      [TripRuleBreak.cases.UnattachedVerifyClaim.make({ id: 'kyoto-crowds' })],
    ],
    [
      'a Verify claim attached to no Day',
      option1With({
        verifyClaims: [
          {
            id: 'late-checkout',
            text: 'Late checkout is free.',
            attachedTo: VerifyClaimAttachment.cases.Day.make({
              date: december(21),
            }),
          },
        ],
      }),
      [TripRuleBreak.cases.UnattachedVerifyClaim.make({ id: 'late-checkout' })],
    ],
    [
      'Days other than the 15 Trip Days',
      option1With({ days: option1.days.slice(1) }),
      [
        TripRuleBreak.cases.NotTheTripDays.make({
          dates: option1.days.slice(1).map((day) => day.date),
        }),
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
                  attachedTo: VerifyClaimAttachment.cases.Itinerary.make({}),
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
