import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, TimeOfDay } from '@/trip/domain/domain'
import {
  checklistItems,
  currentSchedule,
  operation,
  stayIdAt,
  storage,
  testTrip,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const provided = Effect.provide([testTrip, storage])

const outsideJapan = { coordinates: { latitude: 48.8584, longitude: 2.2945 } }

/** The current Schedule, with an Activity on December 15 added as operation 1. */
const scheduleWithActivity = Effect.gen(function* () {
  const { activityId } = yield* Trip.use((trip) =>
    trip.addActivity({
      operationId: operation(1),
      date: december(15),
      title: 'Walk Gion',
    }),
  )

  return { schedule: yield* currentSchedule, activityId }
})

const tagsOf = (errors: Record<string, { readonly _tag: string }>) =>
  Object.fromEntries(
    Object.entries(errors).map(([write, { _tag }]) => [write, _tag]),
  )

/** What the Trip shows: its Schedule, the Trip note and the Checklist. */
const shown = Effect.all({
  schedules: Trip.use((trip) => trip.schedules),
  checklist: checklistItems,
})

/**
 * Every write that records its result under an operation id, run as
 * operation 200.
 */
const recordedWrites = {
  splitStay: Effect.flatMap(currentSchedule, (schedule) =>
    Trip.use((trip) =>
      trip.splitStay({
        operationId: operation(200),
        stayId: stayIdAt(schedule, 1),
        date: december(11),
      }),
    ),
  ),
  mergeStays: Effect.flatMap(currentSchedule, (schedule) =>
    Trip.use((trip) =>
      Effect.flatMap(
        trip.splitStay({
          operationId: operation(199),
          stayId: stayIdAt(schedule, 1),
          date: december(11),
        }),
        (split) =>
          trip.mergeStays({
            operationId: operation(200),
            stayIds: [stayIdAt(split.schedule, 1), stayIdAt(split.schedule, 2)],
          }),
      ),
    ),
  ),
  addActivity: Trip.use((trip) =>
    trip.addActivity({
      operationId: operation(200),
      date: december(14),
      title: 'Onsen',
    }),
  ),
  addOwnChecklistItem: Trip.use((trip) =>
    trip.addOwnChecklistItem({
      operationId: operation(200),
      text: 'Buy a Suica',
    }),
  ),
}

describe('Schedule writes', () => {
  it.effect('refuse invalid input as such, writing nothing', () =>
    Effect.gen(function* () {
      const { schedule, activityId } = yield* scheduleWithActivity
      const before = yield* shown
      const stayId = stayIdAt(schedule, 1)
      const tooLong = 'あ'.repeat(10_001)

      const errors = yield* Trip.use((trip) =>
        Effect.all({
          writeDayNote: Effect.flip(
            trip.writeDayNote({ date: december(14), note: tooLong }),
          ),
          writeStayNote: Effect.flip(
            trip.writeStayNote({ stayId, note: tooLong }),
          ),
          writeHotelDetails: Effect.flip(
            trip.writeHotelDetails({
              stayId,
              details: { name: 'あ'.repeat(501) },
            }),
          ),
          addActivity: Effect.flip(
            trip.addActivity({
              operationId: operation(5),
              date: december(14),
              title: ' ',
              time: TimeOfDay.make('18:00'),
            }),
          ),
          editActivity: Effect.flip(
            trip.editActivity({ activityId, note: tooLong }),
          ),
          setPin: Effect.flip(
            trip.setPin({ target: { activityId }, pin: outsideJapan }),
          ),
        }),
      )

      assert.deepStrictEqual(
        { errors: tagsOf(errors), shown: yield* shown },
        {
          errors: {
            writeDayNote: 'NoteTooLong',
            writeStayNote: 'NoteTooLong',
            writeHotelDetails: 'HotelDetailTooLong',
            addActivity: 'ActivityTitleInvalid',
            editActivity: 'NoteTooLong',
            setPin: 'CoordinatesOutsideJapan',
          },
          shown: before,
        },
      )
    }).pipe(provided),
  )

  describe.each(Object.entries(recordedWrites))('%s', (_, write) => {
    it.effect(
      'returns the recorded result when its operation id repeats, writing nothing more',
      () =>
        Effect.gen(function* () {
          const first = yield* write
          const after = yield* shown
          const repeat = yield* write

          assert.deepStrictEqual(
            { repeat, shown: yield* shown },
            { repeat: first, shown: after },
          )
        }).pipe(provided),
    )
  })
})
