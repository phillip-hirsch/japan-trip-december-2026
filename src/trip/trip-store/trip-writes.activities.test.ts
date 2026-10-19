import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import {
  AddActivityOutcome,
  december,
  EditActivityOutcome,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  SetPinOutcome,
} from '@/trip/domain/domain'
import { activityTitleMaxLength } from '@/trip/domain/limits'
import {
  activitiesOn,
  choose,
  kyotoStayId,
  operation,
  storage,
  tripWithOption1,
} from '@/trip/trip/testing'
import { dayWithThree, describedOn } from '@/trip/trip/Trip.activities.testing'
import {
  activityTarget,
  fushimiInari,
  hotelTarget,
} from '@/trip/trip/Trip.pins.testing'
import { runTripWrite } from '@/trip/trip-store/trip-writes'

const run = Effect.provide([tripWithOption1, storage])

describe('runTripWrite for an Activity', () => {
  it.effect('answers an added Activity with Added and its id', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)

      const outcome = yield* runTripWrite('addActivity', {
        operationId: operation(2),
        scheduleId,
        date: december(15),
        title: 'Kiyomizu-dera',
      })

      const [added] = yield* activitiesOn(december(15))

      assert.deepStrictEqual(
        outcome,
        AddActivityOutcome.cases.Added.make({ activityId: added?.id ?? '' }),
      )
    }).pipe(run),
  )

  it.effect(
    'answers a blank title with ActivityTitleInvalid and the limit',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)

        const outcome = yield* runTripWrite('addActivity', {
          operationId: operation(2),
          scheduleId,
          date: december(15),
          title: '  ',
        })

        assert.deepStrictEqual(
          { outcome, activities: yield* describedOn(december(15)) },
          {
            outcome: AddActivityOutcome.cases.ActivityTitleInvalid.make({
              maxLength: activityTitleMaxLength,
            }),
            activities: [],
          },
        )
      }).pipe(run),
  )

  it.effect('answers an edited Activity with Edited', () =>
    Effect.gen(function* () {
      const { scheduleId, walk } = yield* dayWithThree

      const outcome = yield* runTripWrite('editActivity', {
        scheduleId,
        activityId: walk,
        note: 'Hanamikoji first',
      })

      assert.deepStrictEqual(
        { outcome, activities: yield* describedOn(december(15)) },
        {
          outcome: EditActivityOutcome.cases.Edited.make({}),
          activities: [
            '09:00 Kiyomizu-dera',
            '--:-- Walk Gion (Hanamikoji first)',
            '19:00 Birthday dinner',
          ],
        },
      )
    }).pipe(run),
  )

  it.effect(
    'answers an Activity the Schedule lacks with ActivityNotFound and its id',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)

        const outcome = yield* runTripWrite('editActivity', {
          scheduleId,
          activityId: 'no-such-activity',
          title: 'Gone',
        })

        assert.deepStrictEqual(
          outcome,
          EditActivityOutcome.cases.ActivityNotFound.make({
            activityId: 'no-such-activity',
          }),
        )
      }).pipe(run),
  )

  it.effect('answers a moved Activity with Moved', () =>
    Effect.gen(function* () {
      const { scheduleId, temple, walk } = yield* dayWithThree

      const outcome = yield* runTripWrite('moveActivity', {
        scheduleId,
        activityId: walk,
        before: temple,
      })

      assert.deepStrictEqual(
        { outcome, activities: yield* describedOn(december(15)) },
        {
          outcome: MoveActivityOutcome.cases.Moved.make({}),
          activities: [
            '--:-- Walk Gion',
            '09:00 Kiyomizu-dera',
            '19:00 Birthday dinner',
          ],
        },
      )
    }).pipe(run),
  )

  it.effect('answers a removed Activity with Removed', () =>
    Effect.gen(function* () {
      const { scheduleId, walk } = yield* dayWithThree

      const outcome = yield* runTripWrite('removeActivity', {
        scheduleId,
        activityId: walk,
      })

      assert.deepStrictEqual(
        { outcome, activities: yield* describedOn(december(15)) },
        {
          outcome: RemoveActivityOutcome.cases.Removed.make({}),
          activities: ['09:00 Kiyomizu-dera', '19:00 Birthday dinner'],
        },
      )
    }).pipe(run),
  )
})

describe('runTripWrite for a Pin', () => {
  it.effect('answers a Pin set on an Activity with Set', () =>
    Effect.gen(function* () {
      const { scheduleId, temple } = yield* dayWithThree

      const outcome = yield* runTripWrite('setPin', {
        scheduleId,
        target: activityTarget(temple),
        pin: fushimiInari,
      })

      const [pinned] = yield* activitiesOn(december(15))

      assert.deepStrictEqual(
        { outcome, pin: pinned?.pin },
        { outcome: SetPinOutcome.cases.Set.make({}), pin: fushimiInari },
      )
    }).pipe(run),
  )

  it.effect(
    'answers a Pin outside Japan with CoordinatesOutsideJapan and its coordinates',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        const london = { latitude: 51.5332609, longitude: -0.1260032 }

        const outcome = yield* runTripWrite('setPin', {
          scheduleId,
          target: hotelTarget(stayId),
          pin: { coordinates: london },
        })

        assert.deepStrictEqual(
          outcome,
          SetPinOutcome.cases.CoordinatesOutsideJapan.make({
            coordinates: london,
          }),
        )
      }).pipe(run),
  )
})
