import { assert, layer } from '@effect/vitest'
import { Effect } from 'effect'

import { Anchor, december } from '@/trip/domain/domain'
import type { IsoDate } from '@/trip/domain/domain'
import { liveTrip } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import type { ExpectedItinerary } from '@/trip/itineraries/expected'
import { expectedOption1 } from '@/trip/itineraries/option-1.expected'
import { expectedOption2 } from '@/trip/itineraries/option-2.expected'
import { expectedOption3 } from '@/trip/itineraries/option-3.expected'
import { expectedOption4 } from '@/trip/itineraries/option-4.expected'

const expectedItineraries: ReadonlyArray<ExpectedItinerary> = [
  expectedOption1,
  expectedOption2,
  expectedOption3,
  expectedOption4,
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

    it.effect('lines up on every comparison row', () =>
      Effect.gen(function* () {
        const itineraries = yield* Trip.use((trip) => trip.itineraries)

        const compared = itineraries.find(
          (itinerary) => itinerary.optionNumber === expected.optionNumber,
        )

        assert.isDefined(compared)
        const { travelTime } = compared.moves
        assert.deepStrictEqual(
          {
            bestFor: compared.bestFor,
            route: compared.route
              .map(({ kanji, romaji }) => `${kanji} (${romaji})`)
              .join(' → '),
            nightsPerBase: compared.nightsPerBase.map(
              ({ base, nights }) => [base.romaji, nights] as const,
            ),
            newToYou: compared.newToYou.map((place) => place.romaji),
            birthday: [
              compared.birthday.base?.romaji,
              compared.birthday.outline,
            ],
            moves: {
              count: compared.moves.count,
              ...(travelTime && {
                travelTime: [travelTime.minMinutes, travelTime.maxMinutes],
              }),
              durationNotGiven: compared.moves.durationNotGiven.map(
                ({ date, mode, from, to }) =>
                  `${dayOfMonth(date)} ${mode} ${from.romaji} → ${to.romaji}`,
              ),
            },
            thursdayBackup: compared.thursdayBackup,
            dayTrips: compared.dayTrips.map(
              ({ place, optional }) =>
                `${place.romaji}${optional ? ' (optional)' : ''}`,
            ),
            flights: compared.flights.map(
              ({ date, from, to }) =>
                `${dayOfMonth(date)} ${from.romaji} → ${to.romaji}`,
            ),
            ryokanStays: compared.ryokanStays.map(
              ({ base, checkIn, checkOut }) =>
                `${base.romaji}, ${dayOfMonth(checkIn)}–${dayOfMonth(checkOut)}`,
            ),
            recommended: compared.recommended,
          },
          {
            bestFor: expected.bestFor,
            route: expected.route,
            nightsPerBase: expected.nightsPerBase,
            newToYou: expected.newToYou,
            birthday: [
              expected.comparison.birthdayBase,
              expected.reasoning.birthdayOutline,
            ],
            moves: expected.comparison.moves,
            thursdayBackup: expected.thursdayBackup,
            dayTrips: expected.comparison.dayTrips,
            flights: expected.comparison.flights,
            ryokanStays: expected.comparison.ryokanStays,
            recommended: expected.recommended,
          },
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
                    changeStations: move.changes.map((station) => station.name),
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
          expected.dayTrips,
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
            Anchor.cases.Arrival.make({ date: december(6) }),
            Anchor.cases.ShigeharuVisit.make({
              date: december(11),
              slot: 'morning',
              tentative: true,
              thursdayBackup: expected.thursdayBackup,
            }),
            Anchor.cases.Birthday.make({ date: december(15) }),
            Anchor.cases.Departure.make({ date: december(20) }),
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
