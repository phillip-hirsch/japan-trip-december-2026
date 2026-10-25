import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { ChooseOutcome, RestoreOutcome, ScheduleId } from '@/trip/domain/domain'
import {
  choose,
  currentSchedule,
  currentScheduleId,
  operation,
  storage,
  tripWithOptions1And2,
} from '@/trip/trip/testing'
import { runTripOperation } from '@/trip/trip-store/trip-operations'

const unknownScheduleId = ScheduleId.make(
  '00000000-0000-4000-8000-000000000999',
)

describe('runTripOperation for choosing an Itinerary', () => {
  it.effect('answers a chosen Itinerary with Chosen and its Schedule', () =>
    Effect.gen(function* () {
      const outcome = yield* runTripOperation('choose', {
        operationId: operation(1),
        optionNumber: 1,
        replacing: yield* currentScheduleId,
      })

      assert.deepStrictEqual(
        outcome,
        ChooseOutcome.cases.Chosen.make({
          scheduleId: (yield* currentSchedule).id,
        }),
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers an Option the Trip lacks with ItineraryNotFound and its number',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('choose', {
          operationId: operation(1),
          optionNumber: 9,
          replacing: yield* currentScheduleId,
        })

        assert.deepStrictEqual(
          outcome,
          ChooseOutcome.cases.ItineraryNotFound.make({ optionNumber: 9 }),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers a choice that names no current Schedule with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripOperation('choose', {
          operationId: operation(2),
          optionNumber: 2,
          replacing: null,
        })

        assert.deepStrictEqual(
          outcome,
          ChooseOutcome.cases.ScheduleChanged.make({}),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})

describe('runTripOperation for restoring a Schedule', () => {
  it.effect('answers a restored Schedule with Restored and its id', () =>
    Effect.gen(function* () {
      const archived = yield* currentScheduleId
      const current = yield* choose(2, 2, archived)

      const outcome = yield* runTripOperation('restore', {
        operationId: operation(3),
        scheduleId: archived,
        replacing: current,
      })

      assert.deepStrictEqual(
        { outcome, current: (yield* currentSchedule).id },
        {
          outcome: RestoreOutcome.cases.Restored.make({ scheduleId: archived }),
          current: archived,
        },
      )
    }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers a Schedule that never existed with ScheduleNotFound and its id',
    () =>
      Effect.gen(function* () {
        const current = yield* currentScheduleId

        const outcome = yield* runTripOperation('restore', {
          operationId: operation(2),
          scheduleId: unknownScheduleId,
          replacing: current,
        })

        assert.deepStrictEqual(
          outcome,
          RestoreOutcome.cases.ScheduleNotFound.make({
            scheduleId: unknownScheduleId,
          }),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )

  it.effect(
    'answers a restore that names an archived Schedule as current with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const first = yield* currentScheduleId
        const second = yield* choose(2, 2, first)
        yield* choose(1, 3, second)

        const outcome = yield* runTripOperation('restore', {
          operationId: operation(4),
          scheduleId: first,
          replacing: second,
        })

        assert.deepStrictEqual(
          outcome,
          RestoreOutcome.cases.ScheduleChanged.make({}),
        )
      }).pipe(Effect.provide([tripWithOptions1And2, storage])),
  )
})
