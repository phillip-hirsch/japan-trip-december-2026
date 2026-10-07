import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import {
  AnchorWarning,
  ChecklistItem,
  december,
  HardRule,
  HardRuleBroken,
  Hotel,
  ScheduleChanged,
  StayNotFound,
} from '@/trip/domain'
import type { IsoDate, ScheduleDetail, ScheduleId } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { operation, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

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

/** The id of the Stay at an index in Trip order. */
const stayIdAt = (schedule: ScheduleDetail, index: number) =>
  schedule.stays[index]?.id ?? ''

/** Moves the check-out of the Stay at an index of the current Schedule. */
const moveCheckOut = (index: number, checkOut: IsoDate) =>
  Effect.gen(function* () {
    const schedule = yield* currentSchedule

    return yield* Trip.use((trip) =>
      trip.moveStayBoundary({
        scheduleId: schedule.id,
        stayId: stayIdAt(schedule, index),
        checkOut,
      }),
    )
  })

/** Each Stay's Base and dates, and each Move's date, in Trip order. */
const datesOf = (schedule: ScheduleDetail) => ({
  stays: schedule.stays.map(({ base, checkIn, checkOut }) => [
    base.id,
    checkIn,
    checkOut,
  ]),
  moves: schedule.days.flatMap(({ date, move }) =>
    move === undefined ? [] : [date],
  ),
})

describe('Trip.moveStayBoundary', () => {
  it.effect(
    'moves the check-out, the next check-in and the Move between them to the new date',
    () =>
      Effect.gen(function* () {
        yield* choose(1, null)
        const { schedule } = yield* moveCheckOut(1, december(12))
        assert.deepStrictEqual(datesOf(schedule), {
          stays: [
            ['tokyo', december(6), december(9)],
            ['kyoto', december(9), december(12)],
            ['kanazawa', december(12), december(17)],
            ['tokyo', december(17), december(20)],
          ],
          moves: [december(9), december(12), december(17)],
        })
        assert.deepStrictEqual(schedule.anchorWarnings, [])
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps both Stays' ids, Hotel details, Stay notes, highlights, Verify claims and ticks",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const kyotoId = stayIdAt(before, 1)
        const kanazawaId = stayIdAt(before, 2)
        const details = { name: 'Hotel Kanazawa', confirmationNumber: 'K-1' }
        const moveId = before.days[7]?.move?.id ?? ''
        yield* Trip.use((trip) =>
          Effect.all([
            trip.writeHotelDetails({ scheduleId, stayId: kanazawaId, details }),
            trip.writeStayNote({ scheduleId, stayId: kyotoId, note: 'Uji' }),
            ...[kyotoId, kanazawaId, moveId].map((itemId) =>
              trip.tickChecklistItem({ scheduleId, itemId, ticked: true }),
            ),
          ]),
        )
        const edited = yield* currentSchedule

        const { schedule } = yield* moveCheckOut(1, december(14))

        const kept = (s: ScheduleDetail) =>
          s.stays.map(({ id, hotel, note, highlights, verifyClaims }) => ({
            id,
            hotel,
            note,
            highlights,
            verifyClaims,
          }))

        assert.deepStrictEqual(kept(schedule), kept(edited))
        assert.deepStrictEqual(
          schedule.stays[2]?.hotel,
          Hotel.cases.Recorded.make(details),
        )
        assert.strictEqual(schedule.days[8]?.move?.id, moveId)

        const ticked = (yield* Trip.use((trip) => trip.checklist)).items
          .filter((item) => item.ticked)
          .map((item) => item.id)

        assert.sameMembers(ticked, [kyotoId, kanazawaId, moveId])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "moves the train Move's Reserve seats reminder to a month before its new date",
    () =>
      Effect.gen(function* () {
        yield* choose(1, null)
        const moveId = (yield* currentSchedule).days[7]?.move?.id ?? ''
        yield* moveCheckOut(1, december(11))

        const item = (yield* Trip.use((trip) => trip.checklist)).items.find(
          ({ id }) => id === moveId,
        )

        assert.deepStrictEqual(
          item !== undefined && ChecklistItem.guards.ReserveSeats(item)
            ? item.reminderDate
            : undefined,
          '2026-11-11',
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  const warnings: ReadonlyArray<
    readonly [
      reason: string,
      index: number,
      checkOut: number,
      warnings: ReadonlyArray<AnchorWarning>,
    ]
  > = [
    [
      'not waking up in Kyoto on December 11',
      0,
      11,
      [AnchorWarning.cases.NotWakingUpInKyoto.make({ base: 'tokyo' })],
    ],
    [
      'a Move on December 15',
      1,
      15,
      [AnchorWarning.cases.MoveOnBirthday.make({})],
    ],
  ]

  for (const [reason, index, checkOut, expected] of warnings) {
    it.effect(`goes ahead with a warning for ${reason}`, () =>
      Effect.gen(function* () {
        yield* choose(1, null)
        const { schedule } = yield* moveCheckOut(index, december(checkOut))
        assert.strictEqual(schedule.stays[index]?.checkOut, december(checkOut))
        assert.deepStrictEqual(schedule.anchorWarnings, expected)
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([trip, storage])),
    )
  }

  it.effect(
    'returns the warning for a last Stay outside Tokyo with the result',
    () =>
      Effect.gen(function* () {
        yield* choose(1, null)
        const { schedule } = yield* moveCheckOut(1, december(12))
        assert.deepStrictEqual(schedule.anchorWarnings, [
          AnchorWarning.cases.EndsOutsideTokyo.make({ base: 'kanazawa' }),
        ])
      }).pipe(
        Effect.provide([
          tripWith([
            {
              ...option1,
              stays: option1.stays
                .slice(0, 3)
                .map((stay) =>
                  stay.base === 'kanazawa'
                    ? { ...stay, checkOut: december(20) }
                    : stay,
                ),
              moves: option1.moves.slice(0, 2),
              verifyClaims: [],
            },
          ]),
          storage,
        ]),
      ),
  )

  const refusals: ReadonlyArray<
    readonly [reason: string, index: number, checkOut: number, rule: HardRule]
  > = [
    [
      'the earlier Stay with no nights',
      1,
      9,
      HardRule.cases.StayWithoutNights.make({ checkIn: december(9) }),
    ],
    [
      'the later Stay with no nights',
      1,
      17,
      HardRule.cases.StayWithoutNights.make({ checkIn: december(13) }),
    ],
    [
      'a Stay skipped over, past December 20',
      1,
      25,
      HardRule.cases.StayWithoutNights.make({ checkIn: december(13) }),
    ],
    [
      'the first Stay with no nights, before December 6',
      0,
      5,
      HardRule.cases.StayWithoutNights.make({ checkIn: december(6) }),
    ],
    [
      'the last check-out after December 20',
      3,
      21,
      HardRule.cases.NotTheTripDates.make({
        checkIn: december(6),
        checkOut: december(21),
      }),
    ],
    [
      'the last check-out before December 20',
      3,
      19,
      HardRule.cases.NotTheTripDates.make({
        checkIn: december(6),
        checkOut: december(19),
      }),
    ],
  ]

  for (const [reason, index, checkOut, rule] of refusals) {
    it.effect(`refuses a move leaving ${reason}, changing nothing`, () =>
      Effect.gen(function* () {
        yield* choose(1, null)
        const before = yield* currentSchedule

        const error = yield* Effect.flip(
          moveCheckOut(index, december(checkOut)),
        )

        assert.deepStrictEqual(error, new HardRuleBroken({ rule }))
        assert.deepStrictEqual(yield* currentSchedule, before)
      }).pipe(Effect.provide([trip, storage])),
    )
  }

  it.effect("refuses a Stay the Schedule doesn't have, changing nothing", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        Trip.use((trip) =>
          trip.moveStayBoundary({
            scheduleId,
            stayId: 'gone',
            checkOut: december(12),
          }),
        ),
      )

      assert.deepStrictEqual(error, new StayNotFound({ stayId: 'gone' }))
      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses an archived or out-of-date Schedule with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, null)
        const archivedBefore = yield* currentSchedule
        yield* choose(2, archived)
        const current = yield* currentSchedule

        const error = yield* Effect.flip(
          Trip.use((trip) =>
            trip.moveStayBoundary({
              scheduleId: archived,
              stayId: stayIdAt(archivedBefore, 1),
              checkOut: december(12),
            }),
          ),
        )

        assert.deepStrictEqual(error, new ScheduleChanged())
        assert.deepStrictEqual(
          datesOf(yield* Trip.use((trip) => trip.schedule(archived))),
          datesOf(archivedBefore),
        )
        assert.deepStrictEqual(yield* currentSchedule, current)
      }).pipe(Effect.provide([trip, storage])),
  )
})
