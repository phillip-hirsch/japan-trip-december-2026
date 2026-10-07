import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import { december } from '@/trip/domain'
import type { IsoDate, Pin, ScheduleId } from '@/trip/domain'
import { places } from '@/trip/places'
import { liveTrip, operation, storage } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

/** Chooses an Itinerary, replacing the Schedule named, if any. */
const choose = (
  optionNumber: number,
  n: number,
  replacing: ScheduleId | null,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

const scheduleMap = Trip.use((trip) => trip.scheduleMap)

/** The id of the current Schedule's Stay at an index in Trip order. */
const stayId = (index: number) =>
  Effect.map(
    Trip.use((trip) => trip.schedules),
    ({ current }) => Option.getOrThrow(current).stays[index]?.id ?? '',
  )

const changeBase = (scheduleId: ScheduleId, index: number, place: string) =>
  Effect.flatMap(stayId(index), (stayId) =>
    Trip.use((trip) => trip.changeStayBase({ scheduleId, stayId, place })),
  )

/** The current Schedule's map, which a test expects to exist. */
const currentMap = Effect.map(scheduleMap, Option.getOrThrow)

describe('Trip.scheduleMap', () => {
  it.effect('shows no map before a Schedule is chosen', () =>
    Effect.gen(function* () {
      assert.isTrue(Option.isNone(yield* scheduleMap))
    }).pipe(Effect.provide([liveTrip, storage])),
  )

  it.effect(
    "draws a fresh Schedule's Bases, Moves and Day trips as its Itinerary's map does",
    () =>
      Effect.gen(function* () {
        const itineraries = yield* Trip.use((trip) => trip.itineraries)
        let replacing: ScheduleId | null = null

        for (const { optionNumber } of itineraries) {
          replacing = yield* choose(optionNumber, optionNumber, replacing)

          const itinerary = yield* Trip.use((trip) =>
            trip.itinerary(optionNumber),
          )

          const { hotels, activities, ...drawn } = yield* currentMap

          assert.deepStrictEqual(
            { drawn, hotels, activities },
            { drawn: itinerary.map, hotels: [], activities: [] },
            `Option ${optionNumber}`,
          )
        }
      }).pipe(Effect.provide([liveTrip, storage])),
  )

  // Option 1's Stays: Tokyo from December 6 to 9, Kyoto to 13, Kanazawa to 17
  // and Tokyo to 20, joined by train Moves with rail sections.
  const { tokyo, kyoto, osaka } = places

  it.effect(
    'draws the Moves either side of a Stay whose Base changed straight between the Bases, and the rest along their lines',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        yield* changeBase(scheduleId, 2, 'osaka')
        const { bases, trainMoves } = yield* currentMap
        assert.deepStrictEqual(
          {
            bases: bases.map((base) => base.id),
            trainMoves: trainMoves.map(({ date, path }) => ({
              date,
              path: path.length > 2 ? 'along its lines' : path,
            })),
          },
          {
            bases: ['tokyo', 'kyoto', 'osaka'],
            trainMoves: [
              { date: december(9), path: 'along its lines' },
              {
                date: december(13),
                path: [kyoto.coordinates, osaka.coordinates],
              },
              {
                date: december(17),
                path: [osaka.coordinates, tokyo.coordinates],
              },
            ],
          },
        )
      }).pipe(Effect.provide([liveTrip, storage])),
  )

  it.effect(
    'draws nothing for a local Move within a Base, and a straight line once its Stays are in two Bases',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const kyotoStay = yield* stayId(1)
        yield* Trip.use((trip) =>
          trip.splitStay({
            operationId: operation(2),
            scheduleId,
            stayId: kyotoStay,
            date: december(11),
          }),
        )
        const afterSplit = yield* currentMap
        yield* changeBase(scheduleId, 2, 'osaka')
        const afterChange = yield* currentMap

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
                path: [kyoto.coordinates, osaka.coordinates],
              },
              {
                date: december(13),
                path: [osaka.coordinates, places.kanazawa.coordinates],
              },
            ],
          ],
        )
      }).pipe(Effect.provide([liveTrip, storage])),
  )

  /** Adds an Activity on a Day, returning its id. */
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

  /** A Pin dropped by hand without a link, near Kyoto Station. */
  const nearKyotoStation: Pin = {
    coordinates: { latitude: 34.9858, longitude: 135.7588 },
  }

  /** A Pin dropped by hand without a link, in Ginza. */
  const ginza: Pin = {
    coordinates: { latitude: 35.6717, longitude: 139.765 },
  }

  it.effect(
    'shows each pinned hotel with its Stay and Hotel details, and each pinned Activity with its Day, leaving the unpinned out',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
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
        // The map shows no notes, so it leaves them out.
        yield* Trip.use((trip) =>
          trip.editActivity({
            scheduleId,
            activityId: shrine,
            note: 'Go early, before the tour groups',
          }),
        )

        const { hotels, activities } = yield* currentMap
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
      }).pipe(Effect.provide([liveTrip, storage])),
  )

  it.effect('shows a hotel pinned before any other Hotel details', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const kyotoStay = yield* stayId(1)
      yield* Trip.use((trip) =>
        trip.setPin({
          scheduleId,
          target: { stayId: kyotoStay },
          pin: nearKyotoStation,
        }),
      )
      assert.deepStrictEqual(
        (yield* currentMap).hotels.map(({ stayId, name, pin }) => ({
          stayId,
          name,
          pin,
        })),
        [{ stayId: kyotoStay, name: undefined, pin: nearKyotoStation }],
      )
    }).pipe(Effect.provide([liveTrip, storage])),
  )
})
