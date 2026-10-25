import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december } from '@/trip/domain/domain'
import type {
  Coordinates,
  IsoDate,
  Pin,
  ScheduleId,
} from '@/trip/domain/domain'
import { option1 } from '@/trip/itinerary/option-1'
import { places } from '@/trip/catalogue/places'
import { stations } from '@/trip/catalogue/rail'
import {
  currentScheduleId,
  operation,
  storage,
  storageStartingFrom,
  testTrip,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { option1With } from '@/trip/trip/Trip.itinerary.testing'

const scheduleMap = Trip.use((trip) => trip.scheduleMap)

const stayId = (index: number) =>
  Effect.map(
    Trip.use((trip) => trip.schedules),
    ({ current }) => current.stays[index]?.id ?? '',
  )

const changeBase = (scheduleId: ScheduleId, index: number, place: string) =>
  Effect.flatMap(stayId(index), (stayId) =>
    Trip.use((trip) => trip.changeStayBase({ scheduleId, stayId, place })),
  )

describe('Trip.scheduleMap', () => {
  const { tokyo, kyoto, kanazawa, uji } = places

  it.effect('shows each Base once, in the order the Trip reaches it', () =>
    Effect.gen(function* () {
      const { bases } = yield* scheduleMap
      assert.deepStrictEqual(
        bases.map(({ romaji, kanji }) => `${romaji} ${kanji}`),
        ['Tokyo 東京', 'Kyoto 京都', 'Kanazawa 金沢'],
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  const isAt = (place: Coordinates) => (point: Coordinates) =>
    point.latitude === place.latitude && point.longitude === place.longitude

  it.effect('draws a train Move from Base to Base through each change', () =>
    Effect.gen(function* () {
      const { trainMoves } = yield* scheduleMap
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
    }).pipe(Effect.provide([testTrip, storage])),
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

  const linesThrough = [
    [9, 'Shizuoka', { latitude: 34.9712, longitude: 138.3886 }],
    [13, 'Ōmi-Imazu', { latitude: 35.3978, longitude: 136.0321 }],
    [17, 'Takasaki', { latitude: 36.3216, longitude: 139.0131 }],
    [17, 'Nagano', { latitude: 36.6437, longitude: 138.1902 }],
  ] as const

  for (const [day, station, coordinates] of linesThrough) {
    it.effect(
      `follows the real line through ${station}, off the straight line, on December ${day}`,
      () =>
        Effect.gen(function* () {
          const { trainMoves } = yield* scheduleMap
          const move = trainMoves.find((move) => move.date === december(day))
          assert.isDefined(move)
          const [from, to] = [move.path[0], move.path.at(-1)]
          assert.isDefined(from)
          assert.isDefined(to)
          assert.isAbove(kmFrom(coordinates, [from, to]), onTheLineKm)
          assert.isBelow(kmFrom(coordinates, move.path), onTheLineKm)
        }).pipe(Effect.provide([testTrip, storage])),
    )
  }

  it.effect(
    'draws a rail section without rail geometry straight between its stations',
    () =>
      Effect.gen(function* () {
        const { trainMoves } = yield* scheduleMap
        assert.deepStrictEqual(trainMoves.at(-1), {
          date: december(17),
          path: [
            kanazawa.coordinates,
            stations.tsuruga.coordinates,
            tokyo.coordinates,
          ],
        })
      }).pipe(
        Effect.provide([
          testTrip,
          storageStartingFrom(
            option1With({
              moves: option1.moves.map((move) =>
                move.date === december(17)
                  ? {
                      ...move,
                      sections: [
                        {
                          mode: 'limited-express',
                          line: 'thunderbird',
                          from: 'tsuruga',
                          to: 'tokyo',
                        },
                      ],
                    }
                  : move,
              ),
            }),
          ),
        ]),
      ),
  )

  it.effect('credits MLIT on a map that follows the rail lines', () =>
    Effect.gen(function* () {
      const { railAttribution } = yield* scheduleMap
      assert.strictEqual(
        railAttribution,
        '「国土数値情報（鉄道データ）」（国土交通省）を加工して作成',
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('credits no rail data on a map that follows no rail line', () =>
    Effect.gen(function* () {
      const { railAttribution } = yield* scheduleMap
      assert.isUndefined(railAttribution)
    }).pipe(
      Effect.provide([
        testTrip,
        storageStartingFrom(
          option1With({
            moves: option1.moves.map((move) => ({ ...move, sections: [] })),
          }),
        ),
      ]),
    ),
  )

  it.effect(
    'draws a Day trip once from its Base, optional only when every one is',
    () =>
      Effect.gen(function* () {
        const { dayTrips } = yield* scheduleMap
        assert.deepStrictEqual(
          dayTrips.map(
            ({ from, to, optional }) =>
              `${from.romaji} → ${to.romaji}${optional ? ' (optional)' : ''}`,
          ),
          ['Tokyo → Kamakura', 'Kyoto → Uji (optional)', 'Tokyo → Enoshima'],
        )
      }).pipe(
        Effect.provide([
          testTrip,
          storageStartingFrom(
            option1With({
              dayTrips: [
                ...option1.dayTrips,
                { date: december(19), place: 'enoshima', optional: false },
                { date: december(19), place: 'kamakura', optional: true },
                { date: december(10), place: 'uji', optional: true },
              ],
            }),
          ),
        ]),
      ),
  )

  it.effect(
    'draws the Moves either side of a Stay whose Base changed straight between the Bases, and the rest along their lines',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        yield* changeBase(scheduleId, 2, 'uji')
        const { bases, trainMoves } = yield* scheduleMap
        assert.deepStrictEqual(
          {
            bases: bases.map((base) => base.id),
            trainMoves: trainMoves.map(({ date, path }) => ({
              date,
              path: path.length > 2 ? 'along its lines' : path,
            })),
          },
          {
            bases: ['tokyo', 'kyoto', 'uji'],
            trainMoves: [
              { date: december(9), path: 'along its lines' },
              {
                date: december(13),
                path: [kyoto.coordinates, uji.coordinates],
              },
              {
                date: december(17),
                path: [uji.coordinates, tokyo.coordinates],
              },
            ],
          },
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'draws nothing for a local Move within a Base, and a straight line once its Stays are in two Bases',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const kyotoStay = yield* stayId(1)
        yield* Trip.use((trip) =>
          trip.splitStay({
            operationId: operation(2),
            scheduleId,
            stayId: kyotoStay,
            date: december(11),
          }),
        )
        const afterSplit = yield* scheduleMap
        yield* changeBase(scheduleId, 2, 'uji')
        const afterChange = yield* scheduleMap

        const straight = ({ trainMoves }: typeof afterSplit) =>
          trainMoves
            .filter(({ path }) => path.length === 2)
            .map(({ date, path }) => ({ date, path }))

        assert.deepStrictEqual(
          [
            afterSplit.trainMoves.map(({ date }) => date),
            straight(afterChange),
          ],
          [
            [december(9), december(13), december(17)],
            [
              {
                date: december(11),
                path: [kyoto.coordinates, uji.coordinates],
              },
              {
                date: december(13),
                path: [uji.coordinates, places.kanazawa.coordinates],
              },
            ],
          ],
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )

  const addActivity = (
    n: number,
    scheduleId: ScheduleId,
    date: IsoDate,
    title: string,
  ) =>
    Effect.map(
      Trip.use((trip) =>
        trip.addActivity({
          operationId: operation(n),
          scheduleId,
          date,
          title,
        }),
      ),
      ({ activityId }) => activityId,
    )

  const fushimiInari: Pin = {
    coordinates: { latitude: 34.9671402, longitude: 135.7726717 },
    link: 'https://goo.gl/maps/9e6EdUNDE18LuEwR7',
  }

  const nearKyotoStation: Pin = {
    coordinates: { latitude: 34.9858, longitude: 135.7588 },
  }

  const ginza: Pin = {
    coordinates: { latitude: 35.6717, longitude: 139.765 },
  }

  it.effect(
    'shows each pinned hotel with its Stay and Hotel details, and each pinned Activity with its Day, leaving the unpinned out',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const tokyoStay = yield* stayId(0)
        const kyotoStay = yield* stayId(1)

        const setPin = (
          target: { activityId: string } | { stayId: string },
          pin: Pin,
        ) => Trip.use((trip) => trip.setPin({ scheduleId, target, pin }))

        yield* Trip.use((trip) =>
          trip.writeHotelDetails({
            scheduleId,
            stayId: kyotoStay,
            details: {
              name: 'Kyoto Ryokan Sakura',
              address: '231 Higashi-Kujo, Minami-ku, Kyoto',
              confirmationNumber: 'KRS-4821',
            },
          }),
        )
        yield* setPin({ stayId: kyotoStay }, nearKyotoStation)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({
            scheduleId,
            stayId: tokyoStay,
            details: { name: 'Hotel without a Pin' },
          }),
        )

        const birthday = yield* addActivity(
          2,
          scheduleId,
          december(15),
          'Birthday dinner',
        )

        const shrine = yield* addActivity(3, scheduleId, december(10), 'Shrine')
        yield* addActivity(4, scheduleId, december(10), 'Unpinned lunch')
        yield* setPin({ activityId: birthday }, ginza)
        yield* setPin({ activityId: shrine }, fushimiInari)
        yield* Trip.use((trip) =>
          trip.editActivity({
            scheduleId,
            activityId: shrine,
            note: 'Go early, before the tour groups',
          }),
        )

        const { hotels, activities } = yield* scheduleMap
        assert.deepStrictEqual(
          { hotels, activities },
          {
            hotels: [
              {
                stayId: kyotoStay,
                base: { ...kyoto, id: 'kyoto', newPlace: false },
                checkIn: december(9),
                checkOut: december(13),
                nights: 4,
                name: 'Kyoto Ryokan Sakura',
                address: '231 Higashi-Kujo, Minami-ku, Kyoto',
                confirmationNumber: 'KRS-4821',
                pin: nearKyotoStation,
              },
            ],
            activities: [
              {
                id: shrine,
                title: 'Shrine',
                date: december(10),
                pin: fushimiInari,
              },
              {
                id: birthday,
                title: 'Birthday dinner',
                date: december(15),
                pin: ginza,
              },
            ],
          },
        )
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('shows a hotel pinned before any other Hotel details', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const kyotoStay = yield* stayId(1)
      yield* Trip.use((trip) =>
        trip.setPin({
          scheduleId,
          target: { stayId: kyotoStay },
          pin: nearKyotoStation,
        }),
      )
      assert.deepStrictEqual(
        (yield* scheduleMap).hotels.map(({ stayId, name, pin }) => ({
          stayId,
          name,
          pin,
        })),
        [{ stayId: kyotoStay, name: undefined, pin: nearKyotoStation }],
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )
})
