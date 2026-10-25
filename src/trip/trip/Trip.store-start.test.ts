import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december } from '@/trip/domain/domain'
import { Itineraries } from '@/trip/itineraries/Itineraries'
import { option1 } from '@/trip/itineraries/option-1'
import {
  currentSchedule,
  option1WithTwoKyotoStays,
  storage,
  storageStartingFrom,
  tripWithOption1,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { startStore } from '@/trip/trip-store/store-start'
import {
  withoutActivities,
  withoutHotels,
  withoutIds,
  withoutOffers,
} from '@/trip/trip/Trip.schedule.testing'

describe('Store start', () => {
  it.effect('gives a fresh store one Schedule copied from Option 1', () =>
    Effect.gen(function* () {
      const { archived } = yield* Trip.use((trip) => trip.schedules)
      const schedule = yield* currentSchedule
      const itinerary = yield* Trip.use((trip) => trip.itinerary(1))

      const withBirthdayNote = withoutActivities(itinerary.days).map((day) =>
        day.date === december(15)
          ? { ...day, note: option1.birthdayOutline }
          : day,
      )

      assert.deepStrictEqual(
        {
          archived: [...archived],
          copy: withoutIds({
            stays: withoutOffers(schedule.stays),
            days: schedule.days,
            verifyClaims: schedule.verifyClaims,
          }),
        },
        {
          archived: [],
          copy: withoutIds({
            stays: withoutHotels(itinerary.stays),
            days: withBirthdayNote,
            verifyClaims: itinerary.verifyClaims,
          }),
        },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('starts from the Itinerary it is given', () =>
    Effect.gen(function* () {
      const schedule = yield* currentSchedule

      assert.deepStrictEqual(
        schedule.stays.map(({ base, checkIn }) => ({ base: base.id, checkIn })),
        option1WithTwoKyotoStays.stays.map(({ base, checkIn }) => ({
          base,
          checkIn,
        })),
      )
    }).pipe(
      Effect.provide([
        tripWithOption1,
        storageStartingFrom(option1WithTwoKyotoStays),
      ]),
    ),
  )

  it.effect('started again, keeps its one Schedule and the edits in it', () =>
    Effect.gen(function* () {
      const before = yield* currentSchedule
      yield* Trip.use((trip) =>
        trip.writeDayNote({
          scheduleId: before.id,
          date: december(15),
          note: 'Dinner at 19:00.',
        }),
      )
      yield* startStore.pipe(Effect.provide(Itineraries.fromContent([option1])))
      const { current, archived } = yield* Trip.use((trip) => trip.schedules)
      const page = yield* Trip.use((trip) => trip.day(december(15)))

      const after = {
        current: current.id,
        archived: archived.length,
        note: page.day.note,
      }

      assert.deepStrictEqual<typeof after>(after, {
        current: before.id,
        archived: 0,
        note: 'Dinner at 19:00.',
      })
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
