import { assert, describe, it } from '@effect/vitest'
import { Effect, Predicate } from 'effect'

import { tripDates } from '@/trip/domain/calendar'
import { ChecklistItem, december } from '@/trip/domain/domain'
import type { ScheduleSnapshot } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { add } from '@/trip/trip/Trip.activities.testing'
import {
  checklistItems,
  currentScheduleId,
  kyotoStayId,
  operation,
  storage,
  tick,
  tripWithOption1,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const scheduleSnapshot = Trip.use((trip) => trip.scheduleSnapshot)

const writeTripNote = Trip.use((trip) =>
  trip.writeTripNote({ note: 'Pack light.' }),
)

const addOwnItem = Trip.use((trip) =>
  trip.addOwnChecklistItem({
    operationId: operation(9),
    text: 'Buy a Suica card',
  }),
)

/** Every note and address the snapshot carries, by where it was written. */
const notesAndAddressesOf = ({ schedules, days }: ScheduleSnapshot) => ({
  tripNote: schedules.tripNote,
  stayNotes: schedules.current.stays.flatMap(({ note }) => note ?? []),
  addresses: schedules.current.stays.flatMap(({ hotel }) =>
    Predicate.isTagged('Recorded')(hotel) ? (hotel.address ?? []) : [],
  ),
  dayNotes: days.flatMap(({ day }) => day.note ?? []),
  activities: days.flatMap(({ day }) =>
    day.activities.map(({ title }) => `${day.date} ${title}`),
  ),
  tonightsAddresses: days.flatMap(({ day, tonight }) =>
    tonight && Predicate.isTagged('Recorded')(tonight.hotel)
      ? [`${day.date} ${tonight.hotel.address}`]
      : [],
  ),
})

describe('Trip.scheduleSnapshot', () => {
  it.effect(
    'reads the whole current Schedule: every Day page, the Checklist with its Ticks, and every note and address',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const kyoto = yield* kyotoStayId

        yield* Trip.use((trip) =>
          trip.writeDayNote({
            scheduleId,
            date: december(14),
            note: 'Onsen at 18:00.',
          }),
        )
        yield* Trip.use((trip) =>
          trip.writeStayNote({ scheduleId, stayId: kyoto, note: 'Near Gion.' }),
        )
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({
            scheduleId,
            stayId: kyoto,
            details: { name: 'Ryokan Example', address: '1 Example-cho' },
          }),
        )
        yield* add(3, scheduleId, december(15), 'Kiyomizu-dera')
        yield* writeTripNote
        yield* addOwnItem
        const firstItem = (yield* checklistItems)[0]?.id ?? ''
        yield* tick(scheduleId, firstItem)

        const snapshot = yield* scheduleSnapshot

        assert.deepStrictEqual(
          {
            schedule: snapshot.schedules.current.id,
            days: snapshot.days.map(({ day }) => day.date),
            ...notesAndAddressesOf(snapshot),
            ticked: snapshot.checklist.items
              .filter(({ ticked }) => ticked)
              .map(({ id }) => id),
            ownItems: snapshot.checklist.items.flatMap((item) =>
              ChecklistItem.guards.Own(item) ? [item.text] : [],
            ),
          },
          {
            schedule: scheduleId,
            days: [...tripDates],
            tripNote: 'Pack light.',
            stayNotes: ['Near Gion.'],
            addresses: ['1 Example-cho'],
            dayNotes: ['Onsen at 18:00.', option1.birthdayOutline],
            activities: ['2026-12-15 Kiyomizu-dera'],
            // The Kyoto Stay covers the nights of December 9 to 12.
            tonightsAddresses: [9, 10, 11, 12].map(
              (day) => `${december(day)} 1 Example-cho`,
            ),
            ticked: [firstItem],
            ownItems: ['Buy a Suica card'],
          },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'matches the Schedules, every Day page and the Checklist as each is read on its own',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        yield* add(2, scheduleId, december(9), 'Senso-ji')

        const snapshot = yield* scheduleSnapshot

        assert.deepStrictEqual(snapshot, {
          schedules: yield* Trip.use((trip) => trip.schedules),
          days: yield* Effect.forEach(tripDates, (date) =>
            Trip.use((trip) => trip.day(date)),
          ),
          checklist: yield* Trip.use((trip) => trip.checklist),
        })
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
