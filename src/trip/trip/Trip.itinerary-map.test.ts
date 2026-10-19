import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import type { Layer } from 'effect'

import { december, ItineraryContent } from '@/trip/domain/domain'
import type { Coordinates } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { places } from '@/trip/catalogue/places'
import { stations } from '@/trip/catalogue/rail'
import { liveTrip, tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { option1With, withStays } from '@/trip/trip/Trip.itinerary.testing'

describe('Itinerary map', () => {
  const mapIn = (trip: Layer.Layer<Trip>, optionNumber: number) =>
    Trip.use((trip) => trip.itinerary(optionNumber)).pipe(
      Effect.map((itinerary) => itinerary.map),
      Effect.provide(trip),
    )

  const mapOf = (content: ItineraryContent) =>
    mapIn(tripWith([content]), content.optionNumber)

  const liveMapOf = (optionNumber: number) => mapIn(liveTrip, optionNumber)

  const { tokyo, kyoto, kanazawa, hakone } = places

  it.effect('shows each Base once, in the order the Trip reaches it', () =>
    Effect.gen(function* () {
      const { bases } = yield* liveMapOf(1)
      assert.deepStrictEqual(
        bases.map(({ romaji, kanji }) => `${romaji} ${kanji}`),
        ['Tokyo 東京', 'Kyoto 京都', 'Kanazawa 金沢'],
      )
    }),
  )

  const isAt = (place: Coordinates) => (point: Coordinates) =>
    point.latitude === place.latitude && point.longitude === place.longitude

  it.effect('draws a train Move from Base to Base through each change', () =>
    Effect.gen(function* () {
      const { trainMoves } = yield* liveMapOf(1)
      assert.deepStrictEqual(
        trainMoves.map(({ date, path }) => ({
          date,
          from: path[0],
          to: path.at(-1),
          throughTsuruga: path.some(isAt(stations.tsuruga.coordinates)),
        })),
        [
          {
            date: december(9),
            from: tokyo.coordinates,
            to: kyoto.coordinates,
            throughTsuruga: false,
          },
          {
            date: december(13),
            from: kyoto.coordinates,
            to: kanazawa.coordinates,
            throughTsuruga: true,
          },
          {
            date: december(17),
            from: kanazawa.coordinates,
            to: tokyo.coordinates,
            throughTsuruga: false,
          },
        ],
      )
    }),
  )

  const kmFrom = (point: Coordinates, path: ReadonlyArray<Coordinates>) => {
    const kmPerDegree = 111.32

    const equirectangularKm = ({ latitude, longitude }: Coordinates) => ({
      x:
        (longitude - point.longitude) *
        kmPerDegree *
        Math.cos((point.latitude * Math.PI) / 180),
      y: (latitude - point.latitude) * kmPerDegree,
    })

    const kmFromSegment = (start: Coordinates, end: Coordinates) => {
      const a = equirectangularKm(start)
      const b = equirectangularKm(end)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx ** 2 + dy ** 2

      const along =
        lengthSquared === 0
          ? 0
          : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSquared))

      return Math.hypot(a.x + along * dx, a.y + along * dy)
    }

    return Math.min(
      ...path
        .slice(1)
        .map((end, index) => kmFromSegment(path[index] ?? end, end)),
    )
  }

  const onTheLineKm = 1

  const shizuoka = { latitude: 34.9712, longitude: 138.3886 }

  const linesThrough = [
    [1, 9, 'Shizuoka', shizuoka],
    [1, 13, 'Ōmi-Imazu', { latitude: 35.3978, longitude: 136.0321 }],
    [1, 17, 'Takasaki', { latitude: 36.3216, longitude: 139.0131 }],
    [1, 17, 'Nagano', { latitude: 36.6437, longitude: 138.1902 }],
    [2, 14, 'Shizuoka', shizuoka],
    [3, 13, 'Shizuoka', shizuoka],
    [4, 13, 'Hiroshima', { latitude: 34.3991, longitude: 132.4742 }],
  ] as const

  for (const [optionNumber, day, station, coordinates] of linesThrough) {
    it.effect(
      `follows the real line through ${station}, off the straight line, on Option ${optionNumber}, December ${day}`,
      () =>
        Effect.gen(function* () {
          const { trainMoves } = yield* liveMapOf(optionNumber)
          const move = trainMoves.find((move) => move.date === december(day))
          assert.isDefined(move)
          const [from, to] = [move.path[0], move.path.at(-1)]
          assert.isDefined(from)
          assert.isDefined(to)
          assert.isAbove(kmFrom(coordinates, [from, to]), onTheLineKm)
          assert.isBelow(kmFrom(coordinates, move.path), onTheLineKm)
        }),
    )
  }

  it.effect('joins a train Move to its Bases straight from its stations', () =>
    Effect.gen(function* () {
      const { trainMoves } = yield* liveMapOf(2)
      assert.deepStrictEqual(
        {
          toHakone: trainMoves[1]?.path.slice(-2),
          toTokyo: trainMoves[2],
        },
        {
          toHakone: [stations.odawara.coordinates, hakone.coordinates],
          toTokyo: {
            date: december(17),
            path: [hakone.coordinates, tokyo.coordinates],
          },
        },
      )
    }),
  )

  it.effect(
    'draws a rail section without rail geometry straight between its stations',
    () =>
      Effect.gen(function* () {
        const { trainMoves } = yield* mapOf({
          ...option2,
          moves: option2.moves.map((move) =>
            move.date === december(17)
              ? {
                  ...move,
                  sections: [
                    {
                      mode: 'limited-express',
                      line: 'thunderbird',
                      from: 'odawara',
                      to: 'tokyo',
                    },
                  ],
                }
              : move,
          ),
        })

        assert.deepStrictEqual(trainMoves.at(-1), {
          date: december(17),
          path: [
            hakone.coordinates,
            stations.odawara.coordinates,
            tokyo.coordinates,
          ],
        })
      }),
  )

  it.effect('credits MLIT on a map that follows the rail lines', () =>
    Effect.gen(function* () {
      const { railAttribution } = yield* liveMapOf(1)
      assert.strictEqual(
        railAttribution,
        '「国土数値情報（鉄道データ）」（国土交通省）を加工して作成',
      )
    }),
  )

  it.effect('credits no rail data on a map that follows no rail line', () =>
    Effect.gen(function* () {
      const { railAttribution } = yield* mapOf(
        option1With({
          moves: option1.moves.map((move) => ({ ...move, sections: [] })),
        }),
      )

      assert.isUndefined(railAttribution)
    }),
  )

  it.effect('draws a flight from Base to Base, never as a train', () =>
    Effect.gen(function* () {
      const { trainMoves, flights } = yield* liveMapOf(4)
      assert.deepStrictEqual(
        {
          trainMoves: trainMoves.map((move) => move.date),
          flights: flights.map(
            ({ date, mode, from, to }) =>
              `${date} ${mode} ${from.romaji} → ${to.romaji}`,
          ),
        },
        {
          trainMoves: [december(9), december(13)],
          flights: ['2026-12-17 flight Fukuoka → Tokyo'],
        },
      )
    }),
  )

  it.effect('draws nothing for a local Move', () =>
    Effect.gen(function* () {
      const stays = withStays(
        ['tokyo', 6, 9],
        ['kyoto', 9, 13],
        ['kanazawa', 13, 17],
        ['tokyo', 17, 18],
        ['tokyo', 18, 20],
      )

      const { trainMoves, flights } = yield* mapOf(
        option1With({
          ...stays,
          moves: stays.moves.map((move) =>
            move.date === december(18) ? { ...move, mode: 'local' } : move,
          ),
        }),
      )

      assert.deepStrictEqual(
        [...trainMoves, ...flights].map((move) => move.date),
        [december(9), december(13), december(17)],
      )
    }),
  )

  it.effect(
    'draws a Day trip once from its Base, optional only when every one is',
    () =>
      Effect.gen(function* () {
        const { dayTrips } = yield* mapOf(
          option1With({
            dayTrips: [
              ...option1.dayTrips,
              { date: december(19), place: 'enoshima', optional: false },
              { date: december(19), place: 'kamakura', optional: true },
              { date: december(10), place: 'uji', optional: true },
            ],
          }),
        )

        assert.deepStrictEqual(
          dayTrips.map(
            ({ from, to, optional }) =>
              `${from.romaji} → ${to.romaji}${optional ? ' (optional)' : ''}`,
          ),
          ['Tokyo → Kamakura', 'Kyoto → Uji (optional)', 'Tokyo → Enoshima'],
        )
      }),
  )
})
