import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, ScheduleId, TimeOfDay } from '@/trip/domain/domain'
import type { ScheduleDetail } from '@/trip/domain/domain'
import {
  checklistItems,
  choose,
  currentSchedule,
  operation,
  scheduleById,
  stayIdAt,
  storage,
  tripWithOption1,
  tripWithOptions1And2,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const provided = Effect.provide([tripWithOptions1And2, storage])

const outsideJapan = { coordinates: { latitude: 48.8584, longitude: 2.2945 } }

/** The Schedule's ids each write below names: its Stays and one Activity. */
interface Named {
  readonly scheduleId: ScheduleId
  readonly schedule: ScheduleDetail
  readonly activityId: string
}

/** Chooses Option 1 as operation `n`, with an Activity on December 15. */
const scheduleWithActivity = Effect.fnUntraced(function* (
  n: number,
  replacing: ScheduleId | null,
) {
  const scheduleId = yield* choose(1, n, replacing)

  const { activityId } = yield* Trip.use((trip) =>
    trip.addActivity({
      operationId: operation(n + 1),
      scheduleId,
      date: december(15),
      title: 'Walk Gion',
    }),
  )

  return { scheduleId, schedule: yield* scheduleById(scheduleId), activityId }
})

/** Every Trip write that names a Schedule, each with valid input. */
const writesNaming = (
  { scheduleId, schedule, activityId }: Named,
  restoring: ScheduleId,
) => {
  const stay = (index: number) => stayIdAt(schedule, index)

  return Trip.use((trip) =>
    Effect.all({
      choose: Effect.flip(
        trip.choose({
          operationId: operation(101),
          optionNumber: 1,
          replacing: scheduleId,
        }),
      ),
      restore: Effect.flip(
        trip.restore({
          operationId: operation(102),
          scheduleId: restoring,
          replacing: scheduleId,
        }),
      ),
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
        trip.changeStayBase({ scheduleId, stayId: stay(2), place: 'osaka' }),
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
  choose: tag,
  restore: tag,
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

const tickedItems = Effect.map(checklistItems, (items) =>
  items.flatMap((item) => (item.ticked ? [item.id] : [])),
)

/** What the Trip shows: its Schedules, the Trip note and the Checklist. */
const shown = Effect.all({
  schedules: Trip.use((trip) => trip.schedules),
  checklist: checklistItems,
})

/**
 * Every write that records its result under an operation id, run as
 * operation 200. Each names the current Schedule given, and restore brings
 * back the archived one given.
 */
const recordedWrites = {
  choose: (current: ScheduleId) =>
    Trip.use((trip) =>
      trip.choose({
        operationId: operation(200),
        optionNumber: 2,
        replacing: current,
      }),
    ),
  restore: (current: ScheduleId, archived: ScheduleId) =>
    Trip.use((trip) =>
      trip.restore({
        operationId: operation(200),
        scheduleId: archived,
        replacing: current,
      }),
    ),
  splitStay: (current: ScheduleId) =>
    Effect.flatMap(scheduleById(current), (schedule) =>
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
    Effect.flatMap(scheduleById(current), (schedule) =>
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

/** A current Schedule, after an earlier one was archived. */
const currentAndArchived = Effect.gen(function* () {
  const archived = yield* choose(1, 1, null)

  return { current: yield* choose(1, 2, archived), archived }
})

describe('Schedule writes', () => {
  it.effect(
    'refuse every write naming an archived Schedule with ScheduleChanged, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* scheduleWithActivity(1, null)
        yield* scheduleWithActivity(3, archived.scheduleId)

        const unchanged = Effect.all({
          shown,
          archived: scheduleById(archived.scheduleId),
        })

        const before = yield* unchanged
        const errors = yield* writesNaming(archived, archived.scheduleId)

        assert.deepStrictEqual(
          { errors: tagsOf(errors), unchanged: yield* unchanged },
          { errors: everyWrite('ScheduleChanged'), unchanged: before },
        )
      }).pipe(provided),
  )

  it.effect('leave no tick on an archived Schedule, once restored', () =>
    Effect.gen(function* () {
      const archived = yield* scheduleWithActivity(1, null)
      const current = yield* scheduleWithActivity(3, archived.scheduleId)
      yield* writesNaming(archived, archived.scheduleId)

      yield* Trip.use((trip) =>
        trip.restore({
          operationId: operation(5),
          scheduleId: archived.scheduleId,
          replacing: current.scheduleId,
        }),
      )

      assert.deepStrictEqual(yield* tickedItems, [])
    }).pipe(provided),
  )

  it.effect(
    'refuse a choose or restore naming no Schedule while one is current',
    () =>
      Effect.gen(function* () {
        const { archived } = yield* currentAndArchived
        const before = yield* shown

        const errors = yield* Trip.use((trip) =>
          Effect.all({
            choose: Effect.flip(
              trip.choose({
                operationId: operation(3),
                optionNumber: 2,
                replacing: null,
              }),
            ),
            restore: Effect.flip(
              trip.restore({
                operationId: operation(4),
                scheduleId: archived,
                replacing: null,
              }),
            ),
          }),
        )

        assert.deepStrictEqual(
          { errors: tagsOf(errors), shown: yield* shown },
          {
            errors: { choose: 'ScheduleChanged', restore: 'ScheduleChanged' },
            shown: before,
          },
        )
      }).pipe(provided),
  )

  it.effect(
    'refuse invalid input as such before checking the Schedule is current',
    () =>
      Effect.gen(function* () {
        const archived = yield* scheduleWithActivity(1, null)
        yield* scheduleWithActivity(3, archived.scheduleId)
        const { scheduleId, activityId } = archived
        const stayId = stayIdAt(archived.schedule, 1)
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

  it.effect(
    'refuse a choose of an unknown Itinerary or a restore of an unknown Schedule from an out-of-date screen with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const { archived } = yield* currentAndArchived
        const before = yield* shown

        const errors = yield* Trip.use((trip) =>
          Effect.all({
            choose: Effect.flip(
              trip.choose({
                operationId: operation(3),
                optionNumber: 9,
                replacing: archived,
              }),
            ),
            restore: Effect.flip(
              trip.restore({
                operationId: operation(4),
                scheduleId: ScheduleId.make(
                  '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f',
                ),
                replacing: archived,
              }),
            ),
          }),
        )

        assert.deepStrictEqual(
          { errors: tagsOf(errors), shown: yield* shown },
          {
            errors: { choose: 'ScheduleChanged', restore: 'ScheduleChanged' },
            shown: before,
          },
        )
      }).pipe(provided),
  )

  it.effect(
    'return the recorded result for a choose retried after its Itinerary left the catalogue',
    () =>
      Effect.gen(function* () {
        const chooseOption2 = Trip.use((trip) =>
          trip.choose({
            operationId: operation(1),
            optionNumber: 2,
            replacing: null,
          }),
        )

        const first = yield* chooseOption2.pipe(
          Effect.provide(tripWithOptions1And2),
        )

        const retry = yield* chooseOption2.pipe(Effect.provide(tripWithOption1))

        assert.deepStrictEqual(retry, first)
      }).pipe(Effect.provide(storage)),
  )

  it.effect('refuse a write naming a Schedule while none is current', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.writeDayNote({
            scheduleId: ScheduleId.make('9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f'),
            date: december(14),
            note: 'Written before choosing.',
          }),
        ),
      )

      assert.strictEqual(error._tag, 'ScheduleChanged')
    }).pipe(provided),
  )

  describe.each(Object.entries(recordedWrites))('%s', (_, write) => {
    it.effect(
      'returns the recorded result when its operation id repeats, writing nothing more',
      () =>
        Effect.gen(function* () {
          const { current, archived } = yield* currentAndArchived
          const first = yield* write(current, archived)
          const after = yield* shown
          const repeat = yield* write(current, archived)

          assert.deepStrictEqual(
            { repeat, shown: yield* shown },
            { repeat: first, shown: after },
          )
        }).pipe(provided),
    )

    it.effect(
      'returns the recorded result for a retry after the Schedule changed',
      () =>
        Effect.gen(function* () {
          const { current, archived } = yield* currentAndArchived
          const first = yield* write(current, archived)
          yield* choose(1, 300, (yield* currentSchedule).id)

          const unchanged = Effect.all({
            shown,
            current: scheduleById(current),
            archived: scheduleById(archived),
          })

          const before = yield* unchanged
          const retry = yield* write(current, archived)

          assert.deepStrictEqual(
            { retry, unchanged: yield* unchanged },
            { retry: first, unchanged: before },
          )
        }).pipe(provided),
    )
  })
})
