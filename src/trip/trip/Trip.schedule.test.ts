import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Option, Struct } from 'effect'

import { ScheduleId, ScheduleNotFound } from '@/trip/domain/domain'
import type { ItineraryContent } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
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
  archivedSchedules,
  choose,
  chooseOption1,
  firstChoose,
  option1WithEveryAttachment,
  secondChoose,
  started,
  trip,
  withoutActivities,
  withoutHotels,
  withoutIds,
  withoutOffers,
} from '@/trip/trip/Trip.schedule.testing'

describe('Trip.scheduleSummary', () => {
  it.effect('names the current Schedule and the Itinerary it came from', () =>
    Effect.gen(function* () {
      const chosen = yield* chooseOption1(firstChoose)
      const summary = yield* Trip.use((trip) => trip.scheduleSummary)
      assert.deepStrictEqual(
        summary,
        Option.some({ id: chosen.scheduleId, sourceOptionNumber: 1 }),
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.choose', () => {
  it.effect('copies the whole Itinerary into a new current Schedule', () =>
    Effect.gen(function* () {
      yield* setTime('2026-10-01T09:30:00Z')
      const chosen = yield* chooseOption1(firstChoose)
      const schedule = yield* currentSchedule
      const itinerary = yield* Trip.use((trip) => trip.itinerary(1))

      assert.deepStrictEqual(
        {
          id: schedule.id,
          status: schedule.status,
          sourceOptionNumber: schedule.sourceOptionNumber,
          sourceContentVersion: schedule.sourceContentVersion,
          chosenAt: schedule.chosenAt,
          birthdayOutline: schedule.birthdayOutline,
        },
        {
          id: chosen.scheduleId,
          status: 'current',
          sourceOptionNumber: 1,
          sourceContentVersion: itinerary.contentVersion,
          chosenAt: '2026-10-01T09:30:00.000Z',
          birthdayOutline: option1.birthdayOutline,
        },
      )
      assert.deepStrictEqual(
        withoutIds({
          stays: withoutOffers(schedule.stays),
          days: schedule.days,
          verifyClaims: schedule.verifyClaims,
        }),
        withoutIds({
          stays: withoutHotels(itinerary.stays),
          days: withoutActivities(itinerary.days),
          verifyClaims: itinerary.verifyClaims,
        }),
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'gives every copied Stay, Move, Day trip, Verify claim and Anchor a fresh id',
    () =>
      Effect.gen(function* () {
        yield* chooseOption1(firstChoose)
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
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('returns the recorded result when an operation id repeats', () =>
    Effect.gen(function* () {
      const first = yield* chooseOption1(firstChoose)
      const before = yield* currentSchedule
      const repeated = yield* chooseOption1(firstChoose)

      const reworded = yield* Trip.use((trip) =>
        trip.choose({
          operationId: firstChoose,
          optionNumber: 2,
          replacing: null,
        }),
      )

      assert.deepStrictEqual(
        { repeated, reworded, after: yield* currentSchedule },
        { repeated: first, reworded: first, after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a choose naming no Schedule while one is current', () =>
    Effect.gen(function* () {
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.choose({
            operationId: secondChoose,
            optionNumber: 1,
            replacing: null,
          }),
        ),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          after: yield* currentSchedule,
        },
        { tag: 'ScheduleChanged', after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fails with ItineraryNotFound and chooses nothing', () =>
    Effect.gen(function* () {
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.choose({
            operationId: firstChoose,
            optionNumber: 99,
            replacing: before.id,
          }),
        ),
      )

      assert.deepStrictEqual(
        { tag: error._tag, after: yield* currentSchedule },
        { tag: 'ItineraryNotFound', after: before },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.choose again', () => {
  it.effect('archives the current Schedule and makes a fresh one current', () =>
    Effect.gen(function* () {
      const first = yield* currentSchedule
      yield* setTime('2026-10-03T12:00:00Z')
      const second = yield* choose(2, operation(2), first.id)
      const current = yield* currentSchedule
      assert.deepStrictEqual(
        {
          current: Struct.pick(current, [
            'id',
            'status',
            'sourceOptionNumber',
            'chosenAt',
          ]),
          archived: [...(yield* archivedSchedules)],
        },
        {
          current: {
            id: second.scheduleId,
            status: 'current',
            sourceOptionNumber: 2,
            chosenAt: '2026-10-03T12:00:00.000Z',
          },
          archived: [
            {
              id: first.id,
              sourceOptionNumber: 1,
              chosenAt: first.chosenAt,
              archivedAt: '2026-10-03T12:00:00.000Z',
            },
          ],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
  it.effect(
    'makes a fresh Schedule from the Itinerary the current one came from',
    () =>
      Effect.gen(function* () {
        const first = yield* started
        const before = yield* currentSchedule
        const second = yield* choose(1, operation(2), first.scheduleId)
        const after = yield* currentSchedule

        const stayIds = (schedule: typeof before) =>
          schedule.stays.map((stay) => stay.id)

        // Store start also wrote December 15's Day note; choosing doesn't.
        const daysOf = (schedule: typeof before) =>
          withoutIds(schedule.days.map((day) => Struct.omit(day, ['note'])))

        assert.deepStrictEqual(
          {
            fresh: second.scheduleId !== first.scheduleId,
            freshCopy: stayIds(after).some((id) =>
              stayIds(before).includes(id),
            ),
            sourceOptionNumber: after.sourceOptionNumber,
            days: daysOf(after),
            archived: (yield* archivedSchedules).map(({ id }) => id),
          },
          {
            fresh: true,
            freshCopy: false,
            sourceOptionNumber: 1,
            days: daysOf(before),
            archived: [first.scheduleId],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('copies a different Itinerary into the fresh Schedule', () =>
    Effect.gen(function* () {
      const first = yield* started
      yield* choose(2, operation(2), first.scheduleId)
      const schedule = yield* currentSchedule
      const itinerary = yield* Trip.use((trip) => trip.itinerary(2))
      assert.deepStrictEqual(
        {
          sourceOptionNumber: schedule.sourceOptionNumber,
          birthdayOutline: schedule.birthdayOutline,
          copy: withoutIds({
            stays: withoutOffers(schedule.stays),
            days: schedule.days,
          }),
          archived: (yield* archivedSchedules).map(({ id }) => id),
        },
        {
          sourceOptionNumber: 2,
          birthdayOutline: option2.birthdayOutline,
          copy: withoutIds({
            stays: withoutHotels(itinerary.stays),
            days: withoutActivities(itinerary.days),
          }),
          archived: [first.scheduleId],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('leaves the current Schedule current when it fails', () =>
    Effect.gen(function* () {
      const first = yield* started
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        choose(99, operation(2), first.scheduleId),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          after: yield* currentSchedule,
          archived: yield* archivedSchedules,
        },
        { tag: 'ItineraryNotFound', after: before, archived: [] },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'archives nothing when storing the fresh Schedule fails part-way',
    () =>
      Effect.gen(function* () {
        // Two Days on one date can't be stored, so the copy fails after the
        // current Schedule has been archived in the same transaction.
        const unstorable: ItineraryContent = {
          ...option2,
          days: [...option2.days, ...option2.days.slice(0, 1)],
        }

        const state = Effect.all({
          current: currentSchedule,
          archived: archivedSchedules,
        })

        const { first, before } = yield* Effect.gen(function* () {
          const first = yield* started

          return { first, before: yield* state }
        }).pipe(Effect.provide(trip))

        const exit = yield* Effect.exit(
          choose(2, operation(2), first.scheduleId).pipe(
            Effect.provide(tripWith([unstorable])),
          ),
        )

        assert.deepStrictEqual(
          {
            failed: Exit.isFailure(exit),
            after: yield* state.pipe(Effect.provide(trip)),
          },
          { failed: true, after: before },
        )
      }).pipe(Effect.provide(storage)),
  )
})

describe('Trip.schedule', () => {
  it.effect('fails with ScheduleNotFound for an unknown Schedule', () =>
    Effect.gen(function* () {
      const unknown = ScheduleId.make('00000000-0000-4000-8000-ffffffffffff')

      const error = yield* Effect.flip(
        Trip.use((trip) => trip.schedule(unknown)),
      )

      assert.deepStrictEqual(
        error,
        new ScheduleNotFound({ scheduleId: unknown }),
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})
