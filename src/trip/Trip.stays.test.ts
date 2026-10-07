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
import type {
  ItineraryContent,
  IsoDate,
  OperationId,
  ScheduleId,
  Stay,
} from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { operation, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'
import type { ScheduleCopy, StayEdit } from '@/trip/Trip'

// Option 1 has four Stays: Tokyo from December 6 to 9, Kyoto to 13, Kanazawa
// to 17 and Tokyo to 20. A train Move joins each pair, and the Kanazawa Stay
// has two Verify claims.
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

const scheduleById = (scheduleId: ScheduleId) =>
  Trip.use((trip) => trip.schedule(scheduleId))

const checklistItems = Effect.map(
  Trip.use((trip) => trip.checklist),
  ({ items }) => items,
)

type Edit = (copy: ScheduleCopy) => Effect.Effect<StayEdit, StayNotFound>

const editStays = (
  scheduleId: ScheduleId,
  edit: Edit,
  operationId?: OperationId,
) =>
  Trip.use((trip) =>
    trip.editStays({ scheduleId, ...(operationId && { operationId }) }, edit),
  )

/** An edit changing the Stay at an index in Trip order. */
const changeStay =
  (index: number, changes: Partial<Stay>): Edit =>
  (copy) =>
    Effect.succeed({
      ...copy,
      stays: copy.stays.map((stay, at) =>
        at === index ? { ...stay, ...changes } : stay,
      ),
    })

/** An edit moving the date where two Stays meet, with the Move between them. */
const moveBoundary =
  (from: number, to: number): Edit =>
  (copy) => {
    const at = (date: IsoDate) =>
      date === december(from) ? december(to) : date

    return Effect.succeed({
      stays: copy.stays.map((stay) => ({
        ...stay,
        checkIn: at(stay.checkIn),
        checkOut: at(stay.checkOut),
      })),
      moves: copy.moves.map((move) => ({ ...move, date: at(move.date) })),
    })
  }

/** Option 1 with Stays over the given nights, a train Move at each boundary. */
const option1With = (
  ...ranges: ReadonlyArray<readonly [base: Stay['base'], number, number]>
): ItineraryContent => ({
  ...option1,
  stays: ranges.map(([base, checkIn, checkOut]) => ({
    base,
    checkIn: december(checkIn),
    checkOut: december(checkOut),
    accommodation: 'hotel',
    highlights: [],
  })),
  moves: ranges.slice(1).map(([, checkIn]) => ({
    date: december(checkIn),
    mode: 'train',
    sections: [],
  })),
  verifyClaims: [],
})

describe('Anchor warnings', () => {
  it.effect('are none for a Schedule keeping every Anchor', () =>
    Effect.gen(function* () {
      yield* choose(1, null)
      assert.deepStrictEqual((yield* currentSchedule).anchorWarnings, [])
    }).pipe(Effect.provide([trip, storage])),
  )

  const cases: ReadonlyArray<
    readonly [
      reason: string,
      content: ItineraryContent,
      warnings: ReadonlyArray<AnchorWarning>,
    ]
  > = [
    [
      'not waking up in Kyoto on December 11',
      option1With(
        ['tokyo', 6, 11],
        ['kyoto', 11, 13],
        ['kanazawa', 13, 17],
        ['tokyo', 17, 20],
      ),
      [AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'tokyo' })],
    ],
    [
      'a Move on December 15',
      option1With(
        ['tokyo', 6, 9],
        ['kyoto', 9, 15],
        ['kanazawa', 15, 17],
        ['tokyo', 17, 20],
      ),
      [AnchorWarning.cases.MoveOnBirthday.make({})],
    ],
    [
      'the last Stay outside Tokyo',
      option1With(['tokyo', 6, 9], ['kyoto', 9, 13], ['kanazawa', 13, 20]),
      [AnchorWarning.cases.EndsOutsideTokyo.make({ base: 'kanazawa' })],
    ],
    [
      'every Anchor warning at once, in Trip order',
      option1With(['tokyo', 6, 12], ['kanazawa', 12, 15], ['kyoto', 15, 20]),
      [
        AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'tokyo' }),
        AnchorWarning.cases.MoveOnBirthday.make({}),
        AnchorWarning.cases.EndsOutsideTokyo.make({ base: 'kyoto' }),
      ],
    ],
  ]

  for (const [reason, content, warnings] of cases) {
    it.effect(
      `are derived for a Schedule with ${reason} each time it's read`,
      () =>
        Effect.gen(function* () {
          const scheduleId = yield* choose(1, null)
          assert.deepStrictEqual(
            (yield* currentSchedule).anchorWarnings,
            warnings,
          )
          assert.deepStrictEqual(
            (yield* scheduleById(scheduleId)).anchorWarnings,
            warnings,
          )
        }).pipe(Effect.provide([tripWith([content]), storage])),
    )
  }
})

describe('Trip.editStays', () => {
  it.effect(
    'returns the Schedule as edited, with the Anchor warnings it now breaks',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const { schedule } = yield* editStays(scheduleId, moveBoundary(13, 15))
        assert.deepStrictEqual(
          schedule.stays.map(({ base, checkIn, checkOut }) => [
            base.id,
            checkIn,
            checkOut,
          ]),
          [
            ['tokyo', december(6), december(9)],
            ['kyoto', december(9), december(15)],
            ['kanazawa', december(15), december(17)],
            ['tokyo', december(17), december(20)],
          ],
        )
        assert.deepStrictEqual(schedule.anchorWarnings, [
          AnchorWarning.cases.MoveOnBirthday.make({}),
        ])
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('warns about each Anchor an edit breaks, without blocking it', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const notInKyoto = yield* editStays(scheduleId, moveBoundary(9, 11))
      assert.deepStrictEqual(notInKyoto.schedule.anchorWarnings, [
        AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'tokyo' }),
      ])

      const outsideTokyo = yield* editStays(
        scheduleId,
        changeStay(3, { base: 'hakone' }),
      )

      assert.deepStrictEqual(outsideTokyo.schedule.anchorWarnings, [
        AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'tokyo' }),
        AnchorWarning.cases.EndsOutsideTokyo.make({ base: 'hakone' }),
      ])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'keeps the ids, Hotel details, Stay notes and ticks of the Stays it keeps',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const kanazawaId = before.stays[2]?.id ?? ''
        const details = { name: 'Hotel Kanazawa', confirmationNumber: 'K-1' }
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId: kanazawaId, details }),
        )
        yield* Trip.use((trip) =>
          trip.writeStayNote({
            scheduleId,
            stayId: kanazawaId,
            note: 'Omicho market',
          }),
        )
        const moveId = before.days[7]?.move?.id ?? ''

        for (const itemId of [kanazawaId, moveId]) {
          yield* Trip.use((trip) =>
            trip.tickChecklistItem({ scheduleId, itemId, ticked: true }),
          )
        }

        const { schedule } = yield* editStays(scheduleId, moveBoundary(13, 14))
        const kanazawa = schedule.stays[2]
        assert.deepStrictEqual(
          schedule.stays.map(({ id }) => id),
          before.stays.map(({ id }) => id),
        )
        assert.deepStrictEqual(
          {
            checkIn: kanazawa?.checkIn,
            hotel: kanazawa?.hotel,
            note: kanazawa?.note,
            verifyClaims: kanazawa?.verifyClaims,
          },
          {
            checkIn: december(14),
            hotel: Hotel.cases.Recorded.make(details),
            note: 'Omicho market',
            verifyClaims: before.stays[2]?.verifyClaims,
          },
        )

        const ticked = (yield* checklistItems).flatMap((item) =>
          item.ticked ? [item] : [],
        )

        assert.deepStrictEqual(
          ticked.map((item) => [
            item._tag,
            item.id,
            ChecklistItem.guards.ReserveSeats(item)
              ? item.reminderDate
              : undefined,
          ]),
          [
            ['BookHotel', kanazawaId, undefined],
            ['ReserveSeats', moveId, '2026-11-14'],
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'drops the Checklist item and tick of a Stay it removes, its Verify claims moving to the Stay now covering its first night',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const kanazawaId = before.stays[2]?.id ?? ''
        yield* Trip.use((trip) =>
          trip.tickChecklistItem({
            scheduleId,
            itemId: kanazawaId,
            ticked: true,
          }),
        )

        const { schedule } = yield* editStays(scheduleId, (copy) =>
          Effect.succeed({
            stays: copy.stays
              .filter((stay) => stay.base !== 'kanazawa')
              .map((stay) =>
                stay.base === 'kyoto'
                  ? { ...stay, checkOut: december(17) }
                  : stay,
              ),
            moves: copy.moves.filter((move) => move.date !== december(13)),
          }),
        )

        assert.deepStrictEqual(
          schedule.stays.map(({ base }) => base.id),
          ['tokyo', 'kyoto', 'tokyo'],
        )
        assert.deepStrictEqual(schedule.stays[1]?.verifyClaims, [
          ...(before.stays[1]?.verifyClaims ?? []),
          ...(before.stays[2]?.verifyClaims ?? []),
        ])
        assert.isFalse(
          (yield* checklistItems).some((item) => item.id === kanazawaId),
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  const refusals: ReadonlyArray<
    readonly [reason: string, edit: Edit, rule: HardRule]
  > = [
    [
      'a Stay with no nights',
      moveBoundary(17, 20),
      HardRule.cases.StayWithoutNights.make({ checkIn: december(20) }),
    ],
    [
      'the first check-in off December 6',
      changeStay(0, { checkIn: december(7) }),
      HardRule.cases.NotTheTripDates.make({
        checkIn: december(7),
        checkOut: december(20),
      }),
    ],
    [
      'the last check-out off December 20',
      changeStay(3, { checkOut: december(19) }),
      HardRule.cases.NotTheTripDates.make({
        checkIn: december(6),
        checkOut: december(19),
      }),
    ],
    [
      'a gap between Stays',
      changeStay(1, { checkOut: december(12) }),
      HardRule.cases.Gap.make({ from: december(12), to: december(13) }),
    ],
    [
      'overlapping Stays',
      changeStay(2, { checkIn: december(12) }),
      HardRule.cases.Overlap.make({ from: december(12), to: december(13) }),
    ],
  ]

  for (const [reason, edit, rule] of refusals) {
    it.effect(`refuses an edit leaving ${reason}, changing nothing`, () =>
      Effect.gen(function* () {
        yield* choose(1, null)
        const before = yield* currentSchedule
        const error = yield* Effect.flip(editStays(before.id, edit))
        assert.deepStrictEqual(error, new HardRuleBroken({ rule }))
        assert.deepStrictEqual(yield* currentSchedule, before)
      }).pipe(Effect.provide([trip, storage])),
    )
  }

  it.effect("passes on the edit's own refusal, changing nothing", () =>
    Effect.gen(function* () {
      yield* choose(1, null)
      const before = yield* currentSchedule

      const differentBases = new HardRuleBroken({
        rule: HardRule.cases.StaysInDifferentBases.make({}),
      })

      const notFound = new StayNotFound({ stayId: 'gone' })

      for (const failure of [differentBases, notFound]) {
        const error = yield* Effect.flip(
          Trip.use((trip) =>
            trip.editStays({ scheduleId: before.id }, () =>
              Effect.fail(failure),
            ),
          ),
        )

        assert.deepStrictEqual(error, failure)
      }

      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses an archived or out-of-date Schedule with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, null)
        yield* choose(2, archived)
        const before = yield* scheduleById(archived)
        const current = yield* currentSchedule

        const error = yield* Effect.flip(
          editStays(archived, moveBoundary(13, 14)),
        )

        assert.strictEqual(error._tag, 'ScheduleChanged')
        assert.deepStrictEqual(yield* scheduleById(archived), before)
        assert.deepStrictEqual(yield* currentSchedule, current)
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the Schedule without editing again when its operation id repeats',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)

        const first = yield* editStays(
          scheduleId,
          moveBoundary(13, 14),
          operation(2),
        )

        const repeat = yield* editStays(
          scheduleId,
          moveBoundary(14, 15),
          operation(2),
        )

        assert.deepStrictEqual(repeat, first)

        const next = yield* editStays(
          scheduleId,
          moveBoundary(14, 15),
          operation(3),
        )

        assert.strictEqual(next.schedule.stays[2]?.checkIn, december(15))
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('writes nothing when the Moves no longer meet the Stays', () =>
    Effect.gen(function* () {
      yield* choose(1, null)
      const before = yield* currentSchedule

      // Such an edit is a defect, so the operation dies. Only the Schedule
      // read back afterwards matters here.
      yield* Effect.exit(
        editStays(before.id, (copy) =>
          Effect.map(moveBoundary(13, 14)(copy), (changes) => ({
            ...changes,
            moves: copy.moves,
          })),
        ),
      )

      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([trip, storage])),
  )
})
