import { assert, describe, it } from '@effect/vitest'
import { Effect, Struct } from 'effect'

import { ScheduleId, ScheduleNotFound } from '@/trip/domain/domain'
import type { ScheduleDetail } from '@/trip/domain/domain'
import { option2 } from '@/trip/itineraries/option-2'
import {
  currentSchedule,
  operation,
  setTime,
  storage,
  tripWith,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import {
  trip,
  choose,
  archivedSchedules,
  revisedOption1,
} from '@/trip/trip/Trip.schedule.testing'

const copyOf = (schedule: ScheduleDetail) =>
  Struct.pick(schedule, ['birthdayOutline', 'verifyClaims', 'stays', 'days'])

describe('Trip.restore', () => {
  it.effect(
    'restores an archived Schedule after a Revision, with its original copy',
    () =>
      Effect.gen(function* () {
        const { first, original, second } = yield* Effect.gen(function* () {
          const first = yield* choose(1, operation(1), null)
          const original = yield* currentSchedule
          yield* setTime('2026-10-02T09:30:00Z')
          const second = yield* choose(2, operation(2), first.scheduleId)

          return { first, original, second }
        }).pipe(Effect.provide(trip))

        const afterRevision = yield* Effect.gen(function* () {
          const archived = yield* Trip.use((trip) =>
            trip.schedule(first.scheduleId),
          )

          const restored = yield* Trip.use((trip) =>
            trip.restore({
              operationId: operation(3),
              scheduleId: first.scheduleId,
              replacing: second.scheduleId,
            }),
          )

          return {
            archived,
            restored,
            current: yield* currentSchedule,
            archivedIds: (yield* archivedSchedules).map(({ id }) => id),
          }
        }).pipe(Effect.provide(tripWith([revisedOption1, option2])))

        const { archived, restored, current, archivedIds } = afterRevision
        assert.deepStrictEqual(
          {
            archived: {
              status: archived.status,
              archivedAt: archived.archivedAt,
              ...copyOf(archived),
            },
            restored,
            current: {
              id: current.id,
              status: current.status,
              archivedAt: current.archivedAt,
              ...copyOf(current),
            },
            archivedIds,
          },
          {
            archived: {
              status: 'archived',
              archivedAt: '2026-10-02T09:30:00.000Z',
              ...copyOf(original),
            },
            restored: { scheduleId: first.scheduleId },
            current: {
              id: first.scheduleId,
              status: 'current',
              archivedAt: null,
              ...copyOf(original),
            },
            archivedIds: [second.scheduleId],
          },
        )
      }).pipe(Effect.provide(storage)),
  )

  it.effect('returns the recorded result when an operation id repeats', () =>
    Effect.gen(function* () {
      yield* setTime('2026-10-01T09:00:00Z')
      const first = yield* choose(1, operation(1), null)
      yield* setTime('2026-10-02T09:00:00Z')
      const second = yield* choose(2, operation(2), first.scheduleId)
      yield* setTime('2026-10-03T09:00:00Z')

      const restore = (replacing: ScheduleId) =>
        Trip.use((trip) =>
          trip.restore({
            operationId: operation(3),
            scheduleId: first.scheduleId,
            replacing,
          }),
        )

      const restored = yield* restore(second.scheduleId)
      yield* setTime('2026-10-04T09:00:00Z')
      const third = yield* choose(1, operation(4), first.scheduleId)

      const before = {
        current: yield* currentSchedule,
        archived: yield* archivedSchedules,
      }

      yield* setTime('2026-10-05T09:00:00Z')
      const repeated = yield* restore(third.scheduleId)
      assert.deepStrictEqual(
        {
          repeated,
          current: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { repeated: restored, ...before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('leaves the current Schedule as it is when restoring it', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      const second = yield* choose(2, operation(2), first.scheduleId)

      const before = {
        current: yield* currentSchedule,
        archived: yield* archivedSchedules,
      }

      yield* setTime('2026-10-05T09:00:00Z')

      const restored = yield* Trip.use((trip) =>
        trip.restore({
          operationId: operation(3),
          scheduleId: second.scheduleId,
          replacing: second.scheduleId,
        }),
      )

      assert.deepStrictEqual(
        {
          restored,
          current: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { restored: { scheduleId: second.scheduleId }, ...before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a restore naming an archived Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      const second = yield* choose(2, operation(2), first.scheduleId)
      yield* choose(1, operation(3), second.scheduleId)

      const before = {
        current: yield* currentSchedule,
        archived: yield* archivedSchedules,
      }

      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.restore({
            operationId: operation(4),
            scheduleId: first.scheduleId,
            replacing: second.scheduleId,
          }),
        ),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          current: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { tag: 'ScheduleChanged', ...before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with ScheduleNotFound for an unknown Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, operation(1), null)
      const unknown = ScheduleId.make('00000000-0000-4000-8000-ffffffffffff')

      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.restore({
            operationId: operation(2),
            scheduleId: unknown,
            replacing: first.scheduleId,
          }),
        ),
      )

      const current = yield* currentSchedule
      assert.deepStrictEqual(
        { error, current: current.id },
        {
          error: new ScheduleNotFound({ scheduleId: unknown }),
          current: first.scheduleId,
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})
