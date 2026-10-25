import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, TimeOfDay } from '@/trip/domain/domain'
import type { ScheduleDetail, ScheduleId } from '@/trip/domain/domain'
import {
  checklistItems,
  currentSchedule,
  operation,
  staleScheduleId,
  stayIdAt,
  storage,
  testTrip,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const provided = Effect.provide([testTrip, storage])

const outsideJapan = { coordinates: { latitude: 48.8584, longitude: 2.2945 } }

/** The Schedule's ids each write below names: its Stays and one Activity. */
interface Named {
  readonly scheduleId: ScheduleId
  readonly schedule: ScheduleDetail
  readonly activityId: string
}

/**
 * The Schedule with an Activity on December 15, added as operation 1, named
 * as `scheduleId`.
 */
const scheduleWithActivity = Effect.fnUntraced(function* (
  naming: (current: ScheduleId) => ScheduleId,
) {
  const { id } = yield* currentSchedule

  const { activityId } = yield* Trip.use((trip) =>
    trip.addActivity({
      operationId: operation(1),
      scheduleId: id,
      date: december(15),
      title: 'Walk Gion',
    }),
  )

  return {
    scheduleId: naming(id),
    schedule: yield* currentSchedule,
    activityId,
  }
})

/** Every Trip write that names a Schedule, each with valid input. */
const writesNaming = ({ scheduleId, schedule, activityId }: Named) => {
  const stay = (index: number) => stayIdAt(schedule, index)

  return Trip.use((trip) =>
    Effect.all({
      writeDayNote: Effect.flip(
        trip.writeDayNote({ scheduleId, date: december(14), note: 'Onsen.' }),
      ),
      writeStayNote: Effect.flip(
        trip.writeStayNote({ scheduleId, stayId: stay(1), note: 'Quiet.' }),
      ),
      writeHotelDetails: Effect.flip(
        trip.writeHotelDetails({
          scheduleId,
          stayId: stay(1),
          details: { name: 'Kyoto Ryokan Sakura' },
        }),
      ),
      splitStay: Effect.flip(
        trip.splitStay({
          scheduleId,
          operationId: operation(103),
          stayId: stay(1),
          date: december(11),
        }),
      ),
      mergeStays: Effect.flip(
        trip.mergeStays({
          scheduleId,
          operationId: operation(104),
          stayIds: [stay(1), stay(2)],
        }),
      ),
      moveStayBoundary: Effect.flip(
        trip.moveStayBoundary({
          scheduleId,
          stayId: stay(1),
          checkOut: december(12),
        }),
      ),
      changeStayBase: Effect.flip(
        trip.changeStayBase({ scheduleId, stayId: stay(2), place: 'kamakura' }),
      ),
      tickChecklistItem: Effect.flip(
        trip.tickChecklistItem({ scheduleId, itemId: stay(1), ticked: true }),
      ),
      addActivity: Effect.flip(
        trip.addActivity({
          operationId: operation(105),
          scheduleId,
          date: december(14),
          title: 'Onsen',
        }),
      ),
      editActivity: Effect.flip(
        trip.editActivity({ scheduleId, activityId, title: 'Renamed' }),
      ),
      moveActivity: Effect.flip(
        trip.moveActivity({ scheduleId, activityId, before: null }),
      ),
      removeActivity: Effect.flip(
        trip.removeActivity({ scheduleId, activityId }),
      ),
      setActivityPin: Effect.flip(
        trip.setPin({
          scheduleId,
          target: { activityId },
          pin: { coordinates: { latitude: 35.0037, longitude: 135.7788 } },
        }),
      ),
      setHotelPin: Effect.flip(
        trip.setPin({
          scheduleId,
          target: { stayId: stay(1) },
          pin: { coordinates: { latitude: 34.9858, longitude: 135.7588 } },
        }),
      ),
    }),
  )
}

const tagsOf = (errors: Record<string, { readonly _tag: string }>) =>
  Object.fromEntries(
    Object.entries(errors).map(([write, { _tag }]) => [write, _tag]),
  )

const everyWrite = (tag: string) => ({
  writeDayNote: tag,
  writeStayNote: tag,
  writeHotelDetails: tag,
  splitStay: tag,
  mergeStays: tag,
  moveStayBoundary: tag,
  changeStayBase: tag,
  tickChecklistItem: tag,
  addActivity: tag,
  editActivity: tag,
  moveActivity: tag,
  removeActivity: tag,
  setActivityPin: tag,
  setHotelPin: tag,
})

/** What the Trip shows: its Schedule, the Trip note and the Checklist. */
const shown = Effect.all({
  schedules: Trip.use((trip) => trip.schedules),
  checklist: checklistItems,
})

/**
 * Every write that records its result under an operation id, run as
 * operation 200. Each names the Schedule given.
 */
const recordedWrites = {
  splitStay: (current: ScheduleId) =>
    Effect.flatMap(currentSchedule, (schedule) =>
      Trip.use((trip) =>
        trip.splitStay({
          scheduleId: current,
          operationId: operation(200),
          stayId: stayIdAt(schedule, 1),
          date: december(11),
        }),
      ),
    ),
  mergeStays: (current: ScheduleId) =>
    Effect.flatMap(currentSchedule, (schedule) =>
      Trip.use((trip) =>
        Effect.flatMap(
          trip.splitStay({
            scheduleId: current,
            operationId: operation(199),
            stayId: stayIdAt(schedule, 1),
            date: december(11),
          }),
          (split) =>
            trip.mergeStays({
              scheduleId: current,
              operationId: operation(200),
              stayIds: [
                stayIdAt(split.schedule, 1),
                stayIdAt(split.schedule, 2),
              ],
            }),
        ),
      ),
    ),
  addActivity: (current: ScheduleId) =>
    Trip.use((trip) =>
      trip.addActivity({
        operationId: operation(200),
        scheduleId: current,
        date: december(14),
        title: 'Onsen',
      }),
    ),
  addOwnChecklistItem: () =>
    Trip.use((trip) =>
      trip.addOwnChecklistItem({
        operationId: operation(200),
        text: 'Buy a Suica',
      }),
    ),
}

describe('Schedule writes', () => {
  it.effect(
    'refuse every write naming a Schedule that isn’t current with ScheduleChanged, leaving the Schedule as it was',
    () =>
      Effect.gen(function* () {
        const named = yield* scheduleWithActivity(() => staleScheduleId)
        const before = yield* shown
        const errors = yield* writesNaming(named)

        assert.deepStrictEqual(
          { errors: tagsOf(errors), shown: yield* shown },
          { errors: everyWrite('ScheduleChanged'), shown: before },
        )
      }).pipe(provided),
  )

  it.effect(
    'refuse invalid input as such before checking the Schedule is current',
    () =>
      Effect.gen(function* () {
        const named = yield* scheduleWithActivity(() => staleScheduleId)
        const { scheduleId, activityId } = named
        const stayId = stayIdAt(named.schedule, 1)
        const tooLong = 'あ'.repeat(10_001)

        const errors = yield* Trip.use((trip) =>
          Effect.all({
            writeDayNote: Effect.flip(
              trip.writeDayNote({
                scheduleId,
                date: december(14),
                note: tooLong,
              }),
            ),
            writeStayNote: Effect.flip(
              trip.writeStayNote({ scheduleId, stayId, note: tooLong }),
            ),
            writeHotelDetails: Effect.flip(
              trip.writeHotelDetails({
                scheduleId,
                stayId,
                details: { name: 'あ'.repeat(501) },
              }),
            ),
            addActivity: Effect.flip(
              trip.addActivity({
                operationId: operation(5),
                scheduleId,
                date: december(14),
                title: ' ',
                time: TimeOfDay.make('18:00'),
              }),
            ),
            editActivity: Effect.flip(
              trip.editActivity({ scheduleId, activityId, note: tooLong }),
            ),
            setPin: Effect.flip(
              trip.setPin({
                scheduleId,
                target: { activityId },
                pin: outsideJapan,
              }),
            ),
          }),
        )

        assert.deepStrictEqual(tagsOf(errors), {
          writeDayNote: 'NoteTooLong',
          writeStayNote: 'NoteTooLong',
          writeHotelDetails: 'HotelDetailTooLong',
          addActivity: 'ActivityTitleInvalid',
          editActivity: 'NoteTooLong',
          setPin: 'CoordinatesOutsideJapan',
        })
      }).pipe(provided),
  )

  describe.each(Object.entries(recordedWrites))('%s', (_, write) => {
    it.effect(
      'returns the recorded result when its operation id repeats, writing nothing more',
      () =>
        Effect.gen(function* () {
          const current = (yield* currentSchedule).id
          const first = yield* write(current)
          const after = yield* shown
          const repeat = yield* write(current)

          assert.deepStrictEqual(
            { repeat, shown: yield* shown },
            { repeat: first, shown: after },
          )
        }).pipe(provided),
    )

    it.effect(
      'returns the recorded result for a retry naming a Schedule no longer current',
      () =>
        Effect.gen(function* () {
          const first = yield* write((yield* currentSchedule).id)
          const before = yield* shown
          const retry = yield* write(staleScheduleId)

          assert.deepStrictEqual(
            { retry, shown: yield* shown },
            { retry: first, shown: before },
          )
        }).pipe(provided),
    )
  })
})
