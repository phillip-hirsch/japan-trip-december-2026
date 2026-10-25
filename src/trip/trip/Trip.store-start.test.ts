import { assert, describe, it } from '@effect/vitest'
import { Effect, Predicate } from 'effect'

import { december } from '@/trip/domain/domain'
import { Itinerary } from '@/trip/itinerary/Itinerary'
import { option1 } from '@/trip/itinerary/option-1'
import {
  currentSchedule,
  option1WithTwoKyotoStays,
  storage,
  storageStartingFrom,
  testTrip,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { startStore } from '@/trip/trip-store/store-start'
import { option1WithEveryAttachment } from '@/trip/trip/Trip.schedule.testing'

describe('Store start', () => {
  it.effect(
    'gives a fresh store one Schedule copied from Option 1, its Birthday outline as the December 15 Day note',
    () =>
      Effect.gen(function* () {
        const { stays, days, verifyClaims } = yield* currentSchedule

        const copied = {
          stays: stays.map(
            ({ base, checkIn, checkOut, accommodation, highlights }) => ({
              base: base.id,
              checkIn,
              checkOut,
              accommodation,
              highlights,
            }),
          ),
          days: days.map(({ date, description, note }) => ({
            date,
            ...(description !== undefined && { description }),
            ...(note !== undefined && { note }),
          })),
          moves: days.flatMap(({ date, move }) =>
            move
              ? [
                  {
                    date,
                    mode: move.mode,
                    sections: move.sections.map(({ mode, line, from, to }) => ({
                      mode,
                      line,
                      from: from.id,
                      to: to.id,
                    })),
                    ...(move.duration && { duration: move.duration }),
                  },
                ]
              : [],
          ),
          dayTrips: days.flatMap(({ date, dayTrips }) =>
            dayTrips.map(({ place, optional }) => ({
              date,
              place: place.id,
              optional,
            })),
          ),
          verifyClaims: [
            ...verifyClaims,
            ...stays.flatMap((stay) => stay.verifyClaims),
            ...days.flatMap((day) => day.verifyClaims),
          ]
            .map(({ text }) => text)
            .sort(),
          shigeharuVisit: days.flatMap(({ anchors }) =>
            anchors.flatMap((anchor) =>
              Predicate.isTagged(anchor, 'ShigeharuVisit')
                ? [{ date: anchor.date, slot: anchor.slot }]
                : [],
            ),
          ),
          nothingRecorded:
            stays.every((stay) =>
              Predicate.isTagged(stay.hotel, 'NotRecorded'),
            ) && days.every((day) => day.activities.length === 0),
        }

        const expected = {
          stays: option1.stays,
          days: option1.days.map((day) =>
            day.date === december(15)
              ? { ...day, note: option1.birthdayOutline }
              : day,
          ),
          moves: option1.moves,
          dayTrips: option1.dayTrips,
          verifyClaims: option1.verifyClaims.map(({ text }) => text).sort(),
          shigeharuVisit: [option1.shigeharuVisit],
          nothingRecorded: true,
        }

        assert.deepStrictEqual<typeof expected>(copied, expected)
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'gives every copied Stay, Move, Day trip, Verify claim and Anchor a fresh id',
    () =>
      Effect.gen(function* () {
        const { stays, days, verifyClaims } = yield* currentSchedule

        const copied = [
          ...stays,
          ...days.flatMap((day) => [
            ...day.anchors,
            ...(day.move ? [day.move] : []),
            ...day.dayTrips,
            ...day.verifyClaims,
          ]),
          ...stays.flatMap((stay) => stay.verifyClaims),
          ...verifyClaims,
        ]

        const ids = copied.map((entity) => entity.id)

        const contentIds = option1WithEveryAttachment.verifyClaims.map(
          (claim) => claim.id,
        )

        assert.deepStrictEqual(
          {
            allDistinct: new Set(ids).size === ids.length,
            fromContent: ids.filter((id) => contentIds.includes(id)),
          },
          { allDistinct: true, fromContent: [] },
        )
      }).pipe(
        Effect.provide([
          testTrip,
          storageStartingFrom(option1WithEveryAttachment),
        ]),
      ),
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
      Effect.provide([testTrip, storageStartingFrom(option1WithTwoKyotoStays)]),
    ),
  )

  it.effect('started again, keeps its one Schedule and the edits in it', () =>
    Effect.gen(function* () {
      const before = yield* currentSchedule
      yield* Trip.use((trip) =>
        trip.writeDayNote({
          date: december(15),
          note: 'Dinner at 19:00.',
        }),
      )
      yield* startStore.pipe(Effect.provide(Itinerary.fromContent(option1)))
      const { current } = yield* Trip.use((trip) => trip.schedules)
      const page = yield* Trip.use((trip) => trip.day(december(15)))

      const after = { current: current.id, note: page.day.note }

      assert.deepStrictEqual<typeof after>(after, {
        current: before.id,
        note: 'Dinner at 19:00.',
      })
    }).pipe(Effect.provide([testTrip, storage])),
  )
})
