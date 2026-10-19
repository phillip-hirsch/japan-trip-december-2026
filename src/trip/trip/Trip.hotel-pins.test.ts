import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, Hotel } from '@/trip/domain/domain'
import { operation, storage } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import {
  trip,
  choose,
  setPin,
  hotelTarget,
  kyotoStayId,
  kyotoHotelOf,
  tonightsHotel,
  fushimiInari,
  droppedByHand,
  ryokan,
} from '@/trip/trip/Trip.pins.testing'

describe('Trip.setPin on a hotel', () => {
  it.effect(
    "records the hotel's Pin on its Stay, shown as tonight's hotel, beside its Hotel details",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
        const pinnedOnly = yield* kyotoHotelOf(scheduleId)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
        )

        const recorded = Hotel.cases.Recorded.make({
          ...ryokan,
          pin: fushimiInari,
        })

        assert.deepStrictEqual(
          [
            pinnedOnly,
            yield* kyotoHotelOf(scheduleId),
            yield* tonightsHotel(december(10)),
          ],
          [
            Hotel.cases.Recorded.make({ pin: fushimiInari }),
            recorded,
            recorded,
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "removes the hotel's Pin, leaving its Hotel details; blank details leave its Pin; with neither it's not recorded",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
        )
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
        yield* setPin(scheduleId, hotelTarget(stayId))
        const unpinned = yield* kyotoHotelOf(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), droppedByHand)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: {} }),
        )
        const pinnedOnly = yield* kyotoHotelOf(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId))
        assert.deepStrictEqual(
          [unpinned, pinnedOnly, yield* kyotoHotelOf(scheduleId)],
          [
            Hotel.cases.Recorded.make(ryokan),
            Hotel.cases.Recorded.make({ pin: droppedByHand }),
            Hotel.cases.NotRecorded.make({}),
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "carries the hotel's Pin with its Stay, and its id, through a Stay edit",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
        )

        yield* Trip.use((trip) =>
          trip.changeStayBase({ scheduleId, stayId, place: 'osaka' }),
        )

        const { schedule } = yield* Trip.use((trip) =>
          trip.moveStayBoundary({ scheduleId, stayId, checkOut: december(14) }),
        )

        assert.deepStrictEqual(
          schedule.stays
            .filter(({ id }) => id === stayId)
            .map(({ base, checkOut, hotel }) => ({
              base: base.id,
              checkOut,
              hotel,
            })),
          [
            {
              base: 'osaka',
              checkOut: december(14),
              hotel: Hotel.cases.Recorded.make({
                ...ryokan,
                pin: fushimiInari,
              }),
            },
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps the hotel's Pin on the earlier Stay after a split, and through a merge back",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)

        const split = yield* Trip.use((trip) =>
          trip.splitStay({
            scheduleId,
            operationId: operation(2),
            stayId,
            date: december(11),
          }),
        )

        const [earlier, later] = split.schedule.stays.filter(
          ({ base }) => base.id === 'kyoto',
        )

        const laterId = later?.id ?? ''
        yield* setPin(scheduleId, hotelTarget(laterId), droppedByHand)

        const merged = yield* Trip.use((trip) =>
          trip.mergeStays({
            scheduleId,
            operationId: operation(3),
            stayIds: [stayId, laterId],
          }),
        )

        const pinned = Hotel.cases.Recorded.make({ pin: fushimiInari })

        assert.deepStrictEqual(
          {
            split: [earlier, later].map((stay) => [stay?.id, stay?.hotel]),
            merged: merged.schedule.stays
              .filter(({ base }) => base.id === 'kyoto')
              .map(({ id, checkOut, hotel }) => [id, checkOut, hotel]),
          },
          {
            split: [
              [stayId, pinned],
              [laterId, Hotel.cases.NotRecorded.make({})],
            ],
            merged: [[stayId, december(13), pinned]],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("keeps the hotel's Pin through a change of its Stay's Base", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const stayId = yield* kyotoStayId(scheduleId)
      yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
      yield* Trip.use((trip) =>
        trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
      )

      const { schedule } = yield* Trip.use((trip) =>
        trip.changeStayBase({ scheduleId, stayId, place: 'osaka' }),
      )

      assert.deepStrictEqual(
        schedule.stays
          .filter(({ id }) => id === stayId)
          .map(({ base, hotel }) => ({ base: base.id, hotel })),
        [
          {
            base: 'osaka',
            hotel: Hotel.cases.Recorded.make({ ...ryokan, pin: fushimiInari }),
          },
        ],
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})
