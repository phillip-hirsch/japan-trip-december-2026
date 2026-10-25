import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import {
  AnchorWarning,
  ChecklistItem,
  december,
  HardRule,
  HardRuleBroken,
  Hotel,
  StayNotFound,
} from '@/trip/domain/domain'
import type { ScheduleDetail, ScheduleId } from '@/trip/domain/domain'
import {
  assertFailedWith,
  currentSchedule,
  currentScheduleId,
  stayIdAt,
  storage,
  testTrip,
  staleScheduleId,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const changeBase = (scheduleId: ScheduleId, stayId: string, place: string) =>
  Trip.use((trip) => trip.changeStayBase({ scheduleId, stayId, place }))

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
    "changes the Base to a catalogue place, keeping the Stay's id and dates",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const before = yield* currentSchedule
        const kanazawaId = stayIdAt(before, 2)

        const { schedule } = yield* changeBase(
          scheduleId,
          kanazawaId,
          'kamakura',
        )

        assert.deepStrictEqual(
          schedule.stays.map(({ id, base, checkIn, checkOut }) => [
            id,
            base.id,
            checkIn,
            checkOut,
          ]),
          [
            [stayIdAt(before, 0), 'tokyo', december(6), december(9)],
            [stayIdAt(before, 1), 'kyoto', december(9), december(13)],
            [kanazawaId, 'kamakura', december(13), december(17)],
            [stayIdAt(before, 3), 'tokyo', december(17), december(20)],
          ],
        )
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect("clears the Stay's copied highlights", () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const before = yield* currentSchedule
      assert.isNotEmpty(before.stays[2]?.highlights)

      const { schedule } = yield* changeBase(
        scheduleId,
        stayIdAt(before, 2),
        'kamakura',
      )

      assert.deepStrictEqual(schedule.stays[2]?.highlights, [])
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'leaves the adjoining Moves their mode, without rail sections or a duration, and the other Moves as they were',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const before = yield* currentSchedule

        const { schedule } = yield* changeBase(
          scheduleId,
          stayIdAt(before, 2),
          'kamakura',
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
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('strips only the one Move next to the first Stay', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const before = yield* currentSchedule

      const { schedule } = yield* changeBase(
        scheduleId,
        stayIdAt(before, 0),
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
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect("keeps the Stay's Hotel details, Stay note and ticks", () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const before = yield* currentSchedule
      const kanazawaId = stayIdAt(before, 2)
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

      const { schedule } = yield* changeBase(scheduleId, kanazawaId, 'kamakura')

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
          ['BookHotel', kanazawaId, 'kamakura'],
          ['ReserveSeats', moveId, undefined],
        ],
      )
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'returns the Anchor warnings a change breaks, without blocking it',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const before = yield* currentSchedule

        const notInKyoto = yield* changeBase(
          scheduleId,
          stayIdAt(before, 1),
          'uji',
        )

        assert.deepStrictEqual(notInKyoto.schedule.stays[1]?.base.id, 'uji')
        assert.deepStrictEqual(notInKyoto.schedule.anchorWarnings, [
          AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'uji' }),
        ])

        const outsideTokyo = yield* changeBase(
          scheduleId,
          stayIdAt(before, 3),
          'enoshima',
        )

        assert.deepStrictEqual(outsideTokyo.schedule.anchorWarnings, [
          AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'uji' }),
          AnchorWarning.cases.EndsOutsideTokyo.make({ base: 'enoshima' }),
        ])
        assert.deepStrictEqual(yield* currentSchedule, outsideTokyo.schedule)
      }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect(
    'offers the six catalogue places, Tokyo and Kyoto as visited and the rest as New places',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const stayId = stayIdAt(yield* currentSchedule, 2)

        const bases = yield* Effect.forEach(
          ['tokyo', 'kyoto', 'kanazawa', 'kamakura', 'uji', 'enoshima'],
          (place) =>
            changeBase(scheduleId, stayId, place).pipe(
              Effect.map(({ schedule }) => {
                const base = schedule.stays[2]?.base

                return [base?.id, base?.newPlace]
              }),
            ),
        )

        assert.deepStrictEqual(bases, [
          ['tokyo', false],
          ['kyoto', false],
          ['kanazawa', true],
          ['kamakura', true],
          ['uji', true],
          ['enoshima', true],
        ])
      }).pipe(Effect.provide([testTrip, storage])),
  )

  for (const place of [
    'osaka',
    'hiroshima',
    'hakone',
    'nikko',
    'fukuoka',
    'dazaifu',
    'atlantis',
    'Kyoto',
    'constructor',
    '',
  ]) {
    it.effect(
      `refuses "${place}", a place outside the catalogue, changing nothing`,
      () =>
        Effect.gen(function* () {
          const scheduleId = yield* currentScheduleId
          const before = yield* currentSchedule

          const error = yield* Effect.flip(
            changeBase(scheduleId, stayIdAt(before, 2), place),
          )

          assertFailedWith(
            error,
            new HardRuleBroken({
              rule: HardRule.cases.PlaceNotInCatalogue.make({ place }),
            }),
          )
          assert.deepStrictEqual(yield* currentSchedule, before)
        }).pipe(Effect.provide([testTrip, storage])),
    )
  }

  it.effect('changes nothing when the Base is already that place', () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const before = yield* currentSchedule

      const { schedule } = yield* changeBase(
        scheduleId,
        stayIdAt(before, 2),
        'kanazawa',
      )

      assert.deepStrictEqual(schedule, before)
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect("refuses a Stay the Schedule doesn't have, changing nothing", () =>
    Effect.gen(function* () {
      const scheduleId = yield* currentScheduleId
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        changeBase(scheduleId, 'gone', 'kamakura'),
      )

      assert.deepStrictEqual(error, new StayNotFound({ stayId: 'gone' }))
      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([testTrip, storage])),
  )

  it.effect('refuses an out-of-date Schedule with ScheduleChanged', () =>
    Effect.gen(function* () {
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        changeBase(staleScheduleId, stayIdAt(before, 2), 'kamakura'),
      )

      assert.strictEqual(error._tag, 'ScheduleChanged')
      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([testTrip, storage])),
  )
})
