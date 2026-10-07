import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import {
  AnchorWarning,
  ChecklistItem,
  december,
  HardRule,
  HardRuleBroken,
  Hotel,
  StayNotFound,
} from '@/trip/domain'
import type { ScheduleDetail, ScheduleId } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { operation, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

// Option 1 has four Stays: Tokyo from December 6 to 9, Kyoto to 13, Kanazawa
// to 17 and Tokyo to 20. A train Move with rail sections and a duration joins
// each pair, and only the Kanazawa Stay has highlights.
const trip = tripWith([option1])

/** Chooses Option 1, replacing the Schedule named, if any. */
const choose = (n: number, replacing: ScheduleId | null) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber: 1, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

const currentSchedule = Effect.map(
  Trip.use((trip) => trip.schedules),
  ({ current }) => Option.getOrThrow(current),
)

const changeBase = (scheduleId: ScheduleId, stayId: string, place: string) =>
  Trip.use((trip) => trip.changeStayBase({ scheduleId, stayId, place }))

/** The id of the Stay at an index in Trip order. */
const stayId = (schedule: ScheduleDetail, index: number) =>
  schedule.stays[index]?.id ?? ''

/** Each Move of a Schedule: its date, mode, rail sections and duration. */
const movesOf = (schedule: ScheduleDetail) =>
  schedule.days.flatMap(({ date, move }) =>
    move
      ? [
          {
            date,
            mode: move.mode,
            sections: move.sections.length,
            duration: move.duration,
          },
        ]
      : [],
  )

describe('Trip.changeStayBase', () => {
  it.effect(
    'changes the Base to a catalogue place, keeping the Stay’s id and dates',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const kanazawaId = stayId(before, 2)

        const { schedule } = yield* changeBase(scheduleId, kanazawaId, 'osaka')

        assert.deepStrictEqual(
          schedule.stays.map(({ id, base, checkIn, checkOut }) => [
            id,
            base.id,
            checkIn,
            checkOut,
          ]),
          [
            [stayId(before, 0), 'tokyo', december(6), december(9)],
            [stayId(before, 1), 'kyoto', december(9), december(13)],
            [kanazawaId, 'osaka', december(13), december(17)],
            [stayId(before, 3), 'tokyo', december(17), december(20)],
          ],
        )
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('clears the Stay’s copied highlights', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule
      assert.isNotEmpty(before.stays[2]?.highlights)

      const { schedule } = yield* changeBase(
        scheduleId,
        stayId(before, 2),
        'osaka',
      )

      assert.deepStrictEqual(schedule.stays[2]?.highlights, [])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'leaves the adjoining Moves their mode, without rail sections or a duration, and the other Moves as they were',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule

        const { schedule } = yield* changeBase(
          scheduleId,
          stayId(before, 2),
          'osaka',
        )

        assert.deepStrictEqual(movesOf(schedule), [
          {
            date: december(9),
            mode: 'train',
            sections: 1,
            duration: { minMinutes: 135, maxMinutes: 135 },
          },
          {
            date: december(13),
            mode: 'train',
            sections: 0,
            duration: undefined,
          },
          {
            date: december(17),
            mode: 'train',
            sections: 0,
            duration: undefined,
          },
        ])
        assert.deepStrictEqual(
          schedule.days.map(({ move }) => move?.id),
          before.days.map(({ move }) => move?.id),
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('strips only the one Move next to the first Stay', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule

      const { schedule } = yield* changeBase(
        scheduleId,
        stayId(before, 0),
        'kamakura',
      )

      assert.deepStrictEqual(
        movesOf(schedule).map(({ date, sections }) => [date, sections]),
        [
          [december(9), 0],
          [december(13), 2],
          [december(17), 1],
        ],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('keeps the Stay’s Hotel details, Stay note and ticks', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule
      const kanazawaId = stayId(before, 2)
      const moveId = before.days[7]?.move?.id ?? ''
      const details = { name: 'Hotel Kanazawa', confirmationNumber: 'K-1' }

      yield* Trip.use((trip) =>
        trip.writeHotelDetails({ scheduleId, stayId: kanazawaId, details }),
      )
      yield* Trip.use((trip) =>
        trip.writeStayNote({ scheduleId, stayId: kanazawaId, note: 'Full?' }),
      )

      for (const itemId of [kanazawaId, moveId]) {
        yield* Trip.use((trip) =>
          trip.tickChecklistItem({ scheduleId, itemId, ticked: true }),
        )
      }

      const { schedule } = yield* changeBase(scheduleId, kanazawaId, 'osaka')

      assert.deepStrictEqual(
        {
          hotel: schedule.stays[2]?.hotel,
          note: schedule.stays[2]?.note,
          verifyClaims: schedule.stays[2]?.verifyClaims,
        },
        {
          hotel: Hotel.cases.Recorded.make(details),
          note: 'Full?',
          verifyClaims: before.stays[2]?.verifyClaims,
        },
      )

      const { items } = yield* Trip.use((trip) => trip.checklist)

      assert.deepStrictEqual(
        items.flatMap((item) =>
          item.ticked
            ? [
                [
                  item._tag,
                  item.id,
                  ChecklistItem.guards.BookHotel(item)
                    ? item.stay.base.id
                    : undefined,
                ],
              ]
            : [],
        ),
        [
          ['BookHotel', kanazawaId, 'osaka'],
          ['ReserveSeats', moveId, undefined],
        ],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the Anchor warnings a change breaks, without blocking it',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule

        const notInKyoto = yield* changeBase(
          scheduleId,
          stayId(before, 1),
          'osaka',
        )

        assert.deepStrictEqual(notInKyoto.schedule.stays[1]?.base.id, 'osaka')
        assert.deepStrictEqual(notInKyoto.schedule.anchorWarnings, [
          AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'osaka' }),
        ])

        const outsideTokyo = yield* changeBase(
          scheduleId,
          stayId(before, 3),
          'hakone',
        )

        assert.deepStrictEqual(outsideTokyo.schedule.anchorWarnings, [
          AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'osaka' }),
          AnchorWarning.cases.EndsOutsideTokyo.make({ base: 'hakone' }),
        ])
        assert.deepStrictEqual(yield* currentSchedule, outsideTokyo.schedule)
      }).pipe(Effect.provide([trip, storage])),
  )

  for (const place of ['atlantis', 'Osaka', 'constructor', '']) {
    it.effect(
      `refuses "${place}", a place outside the catalogue, changing nothing`,
      () =>
        Effect.gen(function* () {
          const scheduleId = yield* choose(1, null)
          const before = yield* currentSchedule

          const error = yield* Effect.flip(
            changeBase(scheduleId, stayId(before, 2), place),
          )

          assert.deepStrictEqual(
            error,
            new HardRuleBroken({
              rule: HardRule.cases.PlaceNotInCatalogue.make({ place }),
            }),
          )
          assert.deepStrictEqual(yield* currentSchedule, before)
        }).pipe(Effect.provide([trip, storage])),
    )
  }

  it.effect('changes nothing when the Base is already that place', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule

      const { schedule } = yield* changeBase(
        scheduleId,
        stayId(before, 2),
        'kanazawa',
      )

      assert.deepStrictEqual(schedule, before)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('refuses a Stay the Schedule doesn’t have, changing nothing', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule

      const error = yield* Effect.flip(changeBase(scheduleId, 'gone', 'osaka'))

      assert.deepStrictEqual(error, new StayNotFound({ stayId: 'gone' }))
      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses an archived or out-of-date Schedule with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, null)
        yield* choose(2, archived)
        const scheduleById = Trip.use((trip) => trip.schedule(archived))
        const before = yield* scheduleById
        const current = yield* currentSchedule

        const error = yield* Effect.flip(
          changeBase(archived, stayId(before, 2), 'osaka'),
        )

        assert.strictEqual(error._tag, 'ScheduleChanged')
        assert.deepStrictEqual(yield* scheduleById, before)
        assert.deepStrictEqual(yield* currentSchedule, current)
      }).pipe(Effect.provide([trip, storage])),
  )
})
