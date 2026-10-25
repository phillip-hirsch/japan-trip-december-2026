import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, Hotel } from '@/trip/domain/domain'
import {
  activitiesOn,
  currentSchedule,
  currentScheduleId,
  kyotoHotel,
  kyotoStayId,
  staleScheduleId,
  storage,
  tripWithOption1,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import {
  setPin,
  addActivity,
  activityTarget,
  hotelTarget,
  fushimiInari,
  droppedByHand,
} from '@/trip/trip/Trip.pins.testing'

describe('Trip.setPin', () => {
  it.effect(
    'sets the Pin on an Activity, with its link, and only on that one',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    "keeps the link of a Pin dropped by hand for a link without coordinates, and replaces the Activity's Pin as a whole",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect("removes an Activity's Pin when given none", () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
      yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
      yield* setPin(scheduleId, activityTarget(shrine))
      assert.deepStrictEqual(
        (yield* activitiesOn(december(10))).map(({ pin }) => pin),
        [undefined],
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect("keeps an Activity's Pin through an edit of its other fields", () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
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
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'refuses a link that is not Google Maps, or a Pin outside Japan, writing nothing',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const stayId = yield* kyotoStayId
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
            hotel: yield* kyotoHotel,
          },
          {
            errors: ['LocationLinkRefused', 'CoordinatesOutsideJapan'],
            activityPin: undefined,
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'refuses a stale Schedule with ScheduleChanged, leaving the Schedule as it was',
    () =>
      Effect.gen(function* () {
        const current = yield* currentScheduleId
        const stayId = yield* kyotoStayId
        const shrine = yield* addActivity(2, current, december(10), 'Shrine')

        const errors = yield* Effect.forEach(
          [
            setPin(staleScheduleId, activityTarget(shrine), fushimiInari),
            setPin(staleScheduleId, hotelTarget(stayId), fushimiInari),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        const schedule = yield* currentSchedule

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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'fails with ActivityNotFound or StayNotFound for one the Schedule lacks',
    () =>
      Effect.gen(function* () {
        const current = yield* currentScheduleId
        const goneStayId = 'no-such-stay'
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
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
