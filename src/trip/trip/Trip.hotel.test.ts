import { assert, describe, it } from '@effect/vitest'
import { Effect, Predicate } from 'effect'

import { december, Hotel } from '@/trip/domain/domain'
import type { ScheduleId } from '@/trip/domain/domain'
import {
  currentScheduleId,
  kyotoHotel,
  kyotoStayId,
  staleScheduleId,
  setTime,
  currentStays,
  storage,
  tonightsHotel,
  tripWithOption1,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const writeHotelDetails = (
  scheduleId: ScheduleId,
  stayId: string,
  details: {
    readonly name?: string
    readonly address?: string
    readonly confirmationNumber?: string
  },
) => Trip.use((trip) => trip.writeHotelDetails({ scheduleId, stayId, details }))

const recordedHotels = Effect.map(currentStays, (stays) =>
  stays.flatMap(({ hotel }) =>
    Predicate.isTagged('Recorded')(hotel) ? [hotel] : [],
  ),
)

const ryokan = {
  name: 'Kyoto Ryokan Sakura',
  address: '231 Higashi-Kujo, Minami-ku, Kyoto',
  confirmationNumber: 'BK-4471-209',
}

describe('Trip.writeHotelDetails', () => {
  it.effect(
    "shows the recorded details as tonight's hotel on every Day the Stay covers",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        yield* writeHotelDetails(scheduleId, yield* kyotoStayId, ryokan)
        const recorded = Hotel.cases.Recorded.make(ryokan)
        const notRecorded = Hotel.cases.NotRecorded.make({})
        assert.deepStrictEqual(
          yield* Effect.forEach(
            [december(8), december(9), december(12), december(13)],
            tonightsHotel,
          ),
          [notRecorded, recorded, recorded, notRecorded],
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect("shows the same tonight's hotel on Today on Home", () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      yield* writeHotelDetails(scheduleId, yield* kyotoStayId, ryokan)
      yield* setTime('2026-12-10T01:00:00Z')
      const home = yield* Trip.use((trip) => trip.home)
      assert.deepStrictEqual(
        Predicate.isTagged('DuringTrip')(home) ? home.today.tonight : undefined,
        (yield* Trip.use((trip) => trip.day(december(10)))).tonight,
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    "keeps tonight's hotel not recorded, and hidden on December 20, until details are written",
    () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(
          yield* Effect.forEach([december(10), december(20)], tonightsHotel),
          [Hotel.cases.NotRecorded.make({}), undefined],
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'replaces the details as a whole, so a field left out of the last write is gone',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const stayId = yield* kyotoStayId
        yield* writeHotelDetails(scheduleId, stayId, ryokan)
        yield* writeHotelDetails(scheduleId, stayId, {
          name: 'Hotel Granvia Kyoto',
          address: '',
          confirmationNumber: 'GV-88123',
        })
        assert.deepStrictEqual(
          yield* kyotoHotel,
          Hotel.cases.Recorded.make({
            name: 'Hotel Granvia Kyoto',
            confirmationNumber: 'GV-88123',
          }),
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'trims each field, and all blank leaves the hotel not recorded',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const stayId = yield* kyotoStayId
        yield* writeHotelDetails(scheduleId, stayId, {
          name: '  Kyoto Ryokan Sakura ',
          address: ' ',
        })
        const trimmed = yield* kyotoHotel
        yield* writeHotelDetails(scheduleId, stayId, {
          name: '',
          address: '  ',
          confirmationNumber: '',
        })
        assert.deepStrictEqual(
          [trimmed, yield* kyotoHotel],
          [
            Hotel.cases.Recorded.make({ name: 'Kyoto Ryokan Sakura' }),
            Hotel.cases.NotRecorded.make({}),
          ],
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('keeps the Stay its id', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* kyotoStayId
      yield* writeHotelDetails(scheduleId, stayId, ryokan)
      assert.strictEqual(yield* kyotoStayId, stayId)
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'refuses a write naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          writeHotelDetails(staleScheduleId, yield* kyotoStayId, ryokan),
        )

        assert.deepStrictEqual(
          { tag: error._tag, hotels: yield* recordedHotels },
          { tag: 'ScheduleChanged', hotels: [] },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('fails with StayNotFound for a Stay the Schedule lacks', () =>
    Effect.gen(function* () {
      const current = yield* currentScheduleId
      const goneStayId = 'no-such-stay'

      const error = yield* Effect.flip(
        writeHotelDetails(current, goneStayId, ryokan),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          stayId: Predicate.isTagged('StayNotFound')(error)
            ? error.stayId
            : undefined,
          hotels: yield* recordedHotels,
        },
        { tag: 'StayNotFound', stayId: goneStayId, hotels: [] },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('accepts 500 characters in a field and rejects one more', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const stayId = yield* kyotoStayId
      const longest = 'あ'.repeat(500)
      yield* writeHotelDetails(scheduleId, stayId, { address: longest })

      const error = yield* Effect.flip(
        writeHotelDetails(scheduleId, stayId, {
          name: 'Kyoto Ryokan Sakura',
          address: `${longest}!`,
        }),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          maxLength: Predicate.isTagged('HotelDetailTooLong')(error)
            ? error.maxLength
            : 0,
          hotel: yield* kyotoHotel,
        },
        {
          tag: 'HotelDetailTooLong',
          maxLength: 500,
          hotel: Hotel.cases.Recorded.make({ address: longest }),
        },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
