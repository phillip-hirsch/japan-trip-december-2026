import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Predicate } from 'effect'

import { december, Hotel } from '@/trip/domain'
import type { IsoDate, ScheduleId } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { operation, setTime, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

const trip = tripWith([option1, option2])

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

const writeHotelDetails = (
  scheduleId: ScheduleId,
  stayId: string,
  details: {
    readonly name?: string
    readonly address?: string
    readonly confirmationNumber?: string
  },
) => Trip.use((trip) => trip.writeHotelDetails({ scheduleId, stayId, details }))

/** A Schedule's Stays, current or archived, in Trip order. */
const staysOf = (scheduleId: ScheduleId) =>
  Effect.map(
    Trip.use((trip) => trip.schedule(scheduleId)),
    ({ stays }) => stays,
  )

/** The id of a Schedule's second Stay: Option 1's Kyoto, December 9–13. */
const kyotoStayId = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.id ?? '')

/** The Kyoto Stay's hotel as a Schedule, current or archived, shows it. */
const kyotoHotelOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.hotel)

/** Every Stay's hotel in a Schedule that has been recorded. */
const recordedHotelsOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) =>
    stays.flatMap(({ hotel }) =>
      Predicate.isTagged('Recorded')(hotel) ? [hotel] : [],
    ),
  )

/** Tonight's hotel on a Day of the current Schedule. */
const tonightsHotel = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).tonight?.hotel,
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
        const scheduleId = yield* choose(1, 1, null)
        yield* writeHotelDetails(
          scheduleId,
          yield* kyotoStayId(scheduleId),
          ryokan,
        )
        const recorded = Hotel.cases.Recorded.make(ryokan)
        const notRecorded = Hotel.cases.NotRecorded.make({})
        assert.deepStrictEqual(
          yield* Effect.forEach(
            [december(8), december(9), december(12), december(13)],
            tonightsHotel,
          ),
          [notRecorded, recorded, recorded, notRecorded],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("shows the same tonight's hotel on Today on Home", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      yield* writeHotelDetails(
        scheduleId,
        yield* kyotoStayId(scheduleId),
        ryokan,
      )
      yield* setTime('2026-12-10T01:00:00Z')
      const home = yield* Trip.use((trip) => trip.home)
      assert.deepStrictEqual(
        Predicate.isTagged('DuringTrip')(home)
          ? home.today?.tonight
          : undefined,
        Option.getOrThrow(yield* Trip.use((trip) => trip.day(december(10))))
          .tonight,
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps tonight's hotel not recorded, and hidden on December 20, until details are written",
    () =>
      Effect.gen(function* () {
        yield* choose(1, 1, null)
        assert.deepStrictEqual(
          yield* Effect.forEach([december(10), december(20)], tonightsHotel),
          [Hotel.cases.NotRecorded.make({}), undefined],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'replaces the details as a whole, so a field left out of the last write is gone',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* writeHotelDetails(scheduleId, stayId, ryokan)
        yield* writeHotelDetails(scheduleId, stayId, {
          name: 'Hotel Granvia Kyoto',
          address: '',
          confirmationNumber: 'GV-88123',
        })
        assert.deepStrictEqual(
          yield* kyotoHotelOf(scheduleId),
          Hotel.cases.Recorded.make({
            name: 'Hotel Granvia Kyoto',
            confirmationNumber: 'GV-88123',
          }),
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'trims each field, and all blank leaves the hotel not recorded',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* writeHotelDetails(scheduleId, stayId, {
          name: '  Kyoto Ryokan Sakura ',
          address: ' ',
        })
        const trimmed = yield* kyotoHotelOf(scheduleId)
        yield* writeHotelDetails(scheduleId, stayId, {
          name: '',
          address: '  ',
          confirmationNumber: '',
        })
        assert.deepStrictEqual(
          [trimmed, yield* kyotoHotelOf(scheduleId)],
          [
            Hotel.cases.Recorded.make({ name: 'Kyoto Ryokan Sakura' }),
            Hotel.cases.NotRecorded.make({}),
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('keeps the Stay its id', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const stayId = yield* kyotoStayId(scheduleId)
      yield* writeHotelDetails(scheduleId, stayId, ryokan)
      assert.strictEqual(yield* kyotoStayId(scheduleId), stayId)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a write naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const stale = yield* choose(1, 1, null)
        const staleStayId = yield* kyotoStayId(stale)
        // Another device chooses again, so this screen's Schedule is stale.
        const current = yield* choose(2, 2, stale)

        const error = yield* Effect.flip(
          writeHotelDetails(stale, staleStayId, ryokan),
        )

        assert.deepStrictEqual(
          {
            tag: error._tag,
            stale: yield* recordedHotelsOf(stale),
            current: yield* recordedHotelsOf(current),
          },
          { tag: 'ScheduleChanged', stale: [], current: [] },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'rejects a write to an archived Schedule, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(archived)
        yield* writeHotelDetails(archived, stayId, ryokan)
        yield* choose(2, 2, archived)

        const error = yield* Effect.flip(
          writeHotelDetails(archived, stayId, { name: 'After archiving' }),
        )

        assert.deepStrictEqual(
          { tag: error._tag, hotel: yield* kyotoHotelOf(archived) },
          { tag: 'ScheduleChanged', hotel: Hotel.cases.Recorded.make(ryokan) },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with StayNotFound for a Stay the Schedule lacks', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      const goneStayId = yield* kyotoStayId(first)
      const current = yield* choose(1, 2, first)

      const error = yield* Effect.flip(
        writeHotelDetails(current, goneStayId, ryokan),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          stayId: Predicate.isTagged('StayNotFound')(error)
            ? error.stayId
            : undefined,
          hotels: yield* recordedHotelsOf(current),
        },
        { tag: 'StayNotFound', stayId: goneStayId, hotels: [] },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('accepts 500 characters in a field and rejects one more', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const stayId = yield* kyotoStayId(scheduleId)
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
          hotel: yield* kyotoHotelOf(scheduleId),
        },
        {
          tag: 'HotelDetailTooLong',
          maxLength: 500,
          hotel: Hotel.cases.Recorded.make({ address: longest }),
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('leaves Hotel details behind when choosing again', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      yield* writeHotelDetails(first, yield* kyotoStayId(first), ryokan)
      const second = yield* choose(1, 2, first)
      assert.deepStrictEqual(
        {
          schedule: yield* recordedHotelsOf(second),
          tonight: yield* tonightsHotel(december(10)),
        },
        { schedule: [], tonight: Hotel.cases.NotRecorded.make({}) },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'archives Hotel details and restores them with their Schedule',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, 1, null)
        yield* writeHotelDetails(first, yield* kyotoStayId(first), ryokan)
        const second = yield* choose(2, 2, first)
        const archived = yield* kyotoHotelOf(first)
        yield* Trip.use((trip) =>
          trip.restore({
            operationId: operation(3),
            scheduleId: first,
            replacing: second,
          }),
        )
        const recorded = Hotel.cases.Recorded.make(ryokan)
        assert.deepStrictEqual(
          [archived, yield* tonightsHotel(december(10))],
          [recorded, recorded],
        )
      }).pipe(Effect.provide([trip, storage])),
  )
})
