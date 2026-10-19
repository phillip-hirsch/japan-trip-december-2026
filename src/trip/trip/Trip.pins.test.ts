import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, Hotel } from '@/trip/domain/domain'
import { operation, storage } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import {
  trip,
  choose,
  setPin,
  addActivity,
  activityTarget,
  hotelTarget,
  activitiesOn,
  kyotoStayId,
  kyotoHotelOf,
  tonightsHotel,
  fushimiInari,
  droppedByHand,
} from '@/trip/trip/Trip.pins.testing'

describe('Trip.setPin', () => {
  it.effect(
    'sets the Pin on an Activity, with its link, and only on that one',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
        yield* addActivity(3, scheduleId, december(10), 'Dinner')
        yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
        assert.deepStrictEqual(
          (yield* activitiesOn(december(10))).map(({ title, pin }) => ({
            title,
            pin,
          })),
          [
            { title: 'Shrine', pin: fushimiInari },
            { title: 'Dinner', pin: undefined },
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps the link of a Pin dropped by hand for a link without coordinates, and replaces the Activity's Pin as a whole",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
        yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)

        const kept = {
          ...droppedByHand,
          link: 'https://maps.app.goo.gl/GK6GhwG7X1CFqwMy8',
        }

        yield* setPin(scheduleId, activityTarget(shrine), kept)
        const afterKept = (yield* activitiesOn(december(10)))[0]?.pin
        yield* setPin(scheduleId, activityTarget(shrine), droppedByHand)
        assert.deepStrictEqual(
          [afterKept, (yield* activitiesOn(december(10)))[0]?.pin],
          [kept, droppedByHand],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("removes an Activity's Pin when given none", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
      yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
      yield* setPin(scheduleId, activityTarget(shrine))
      assert.deepStrictEqual(
        (yield* activitiesOn(december(10))).map(({ pin }) => pin),
        [undefined],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("keeps an Activity's Pin through an edit of its other fields", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
      yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
      yield* Trip.use((trip) =>
        trip.editActivity({
          scheduleId,
          activityId: shrine,
          title: 'Fushimi Inari at dawn',
          note: 'Go early',
        }),
      )
      assert.deepStrictEqual(
        (yield* activitiesOn(december(10))).map(({ title, pin }) => ({
          title,
          pin,
        })),
        [{ title: 'Fushimi Inari at dawn', pin: fushimiInari }],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a link that is not Google Maps, or a Pin outside Japan, writing nothing',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')

        const errors = yield* Effect.forEach(
          [
            setPin(scheduleId, activityTarget(shrine), {
              ...droppedByHand,
              link: 'https://example.com/maps/@34.9858,135.7588,15z',
            }),
            setPin(scheduleId, hotelTarget(stayId), {
              coordinates: { latitude: 51.5332609, longitude: -0.1260032 },
            }),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        assert.deepStrictEqual(
          {
            errors,
            activityPin: (yield* activitiesOn(december(10)))[0]?.pin,
            hotel: yield* kyotoHotelOf(scheduleId),
          },
          {
            errors: ['LocationLinkRefused', 'CoordinatesOutsideJapan'],
            activityPin: undefined,
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a stale or archived Schedule with ScheduleChanged, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(archived)
        const shrine = yield* addActivity(2, archived, december(10), 'Shrine')
        yield* choose(2, 3, archived)

        const errors = yield* Effect.forEach(
          [
            setPin(archived, activityTarget(shrine), fushimiInari),
            setPin(archived, hotelTarget(stayId), fushimiInari),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        const schedule = yield* Trip.use((trip) => trip.schedule(archived))

        assert.deepStrictEqual(
          {
            errors,
            activityPins: schedule.days.flatMap(({ activities }) =>
              activities.map(({ pin }) => pin),
            ),
            hotel: schedule.stays[1]?.hotel,
          },
          {
            errors: ['ScheduleChanged', 'ScheduleChanged'],
            activityPins: [undefined],
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'fails with ActivityNotFound or StayNotFound for one the Schedule lacks',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, 1, null)
        const goneStayId = yield* kyotoStayId(first)
        const current = yield* choose(1, 2, first)
        const shrine = yield* addActivity(3, current, december(10), 'Shrine')
        yield* Trip.use((trip) =>
          trip.removeActivity({ scheduleId: current, activityId: shrine }),
        )

        const errors = yield* Effect.forEach(
          [
            setPin(current, activityTarget(shrine), fushimiInari),
            setPin(current, hotelTarget(goneStayId), fushimiInari),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        assert.deepStrictEqual(errors, ['ActivityNotFound', 'StayNotFound'])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('archives Pins and restores them with their Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      const shrine = yield* addActivity(2, first, december(10), 'Shrine')
      yield* setPin(first, activityTarget(shrine), fushimiInari)
      yield* setPin(
        first,
        hotelTarget(yield* kyotoStayId(first)),
        droppedByHand,
      )
      const second = yield* choose(2, 3, first)

      const fresh = {
        activities: yield* activitiesOn(december(10)),
        hotel: yield* tonightsHotel(december(10)),
      }

      yield* Trip.use((trip) =>
        trip.restore({
          operationId: operation(4),
          scheduleId: first,
          replacing: second,
        }),
      )
      assert.deepStrictEqual(
        {
          fresh,
          restored: {
            pins: (yield* activitiesOn(december(10))).map(({ pin }) => pin),
            hotel: yield* tonightsHotel(december(10)),
          },
        },
        {
          fresh: { activities: [], hotel: Hotel.cases.NotRecorded.make({}) },
          restored: {
            pins: [fushimiInari],
            hotel: Hotel.cases.Recorded.make({ pin: droppedByHand }),
          },
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})
