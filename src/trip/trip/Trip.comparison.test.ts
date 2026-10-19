import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, ItineraryContent } from '@/trip/domain/domain'
import type { MoveSummary } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { liveTrip, tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { option1With, withStays } from '@/trip/trip/Trip.itinerary.testing'

describe('Comparison rows', () => {
  const comparisonOf = (content: ItineraryContent) =>
    Trip.use((trip) => trip.itineraries).pipe(
      Effect.map(([itinerary]) => itinerary),
      Effect.provide(tripWith([content])),
    )

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
          travelTime: { minMinutes: 135 + 150, maxMinutes: 135 + 150 },
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

describe('Comparison map', () => {
  const comparisonMap = Trip.use((trip) => trip.comparisonMap).pipe(
    Effect.provide(liveTrip),
  )

  it.effect('shows each Base once, in the order the Itineraries reach it', () =>
    Effect.gen(function* () {
      const { bases } = yield* comparisonMap
      assert.deepStrictEqual(
        bases.map(({ romaji }) => romaji),
        ['Tokyo', 'Kyoto', 'Kanazawa', 'Hakone', 'Fukuoka'],
      )
    }),
  )

  it.effect('draws every Itinerary’s Moves as its own page’s map does', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      const { itineraries } = yield* trip.comparisonMap

      const pages = yield* Effect.forEach(
        yield* trip.itineraries,
        ({ optionNumber }) => trip.itinerary(optionNumber),
      )

      assert.deepStrictEqual(
        itineraries,
        pages.map(({ optionNumber, recommended, map }) => ({
          optionNumber,
          recommended,
          trainMoves: map.trainMoves,
          flights: map.flights,
        })),
      )
    }).pipe(Effect.provide(liveTrip)),
  )

  it.effect('credits MLIT when any Itinerary follows the rail lines', () =>
    Effect.gen(function* () {
      const { railAttribution } = yield* comparisonMap
      assert.strictEqual(
        railAttribution,
        '「国土数値情報（鉄道データ）」（国土交通省）を加工して作成',
      )
    }),
  )

  it.effect('credits no rail data when no Itinerary follows a rail line', () =>
    Effect.gen(function* () {
      const { railAttribution } = yield* Trip.use(
        (trip) => trip.comparisonMap,
      ).pipe(
        Effect.provide(
          tripWith([
            {
              ...option1,
              moves: option1.moves.map((move) => ({ ...move, sections: [] })),
            },
            {
              ...option2,
              moves: option2.moves.map((move) => ({ ...move, sections: [] })),
            },
          ]),
        ),
      )

      assert.isUndefined(railAttribution)
    }),
  )
})
