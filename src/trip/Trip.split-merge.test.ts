import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import {
  AnchorWarning,
  december,
  HardRule,
  HardRuleBroken,
  Hotel,
  StayNotFound,
} from '@/trip/domain'
import type {
  ItineraryContent,
  IsoDate,
  ScheduleDetail,
  ScheduleId,
} from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { operation, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

// Option 1 has four Stays: Tokyo from December 6 to 9, Kyoto to 13, Kanazawa
// to 17 and Tokyo to 20. A train Move joins each pair, and the Kanazawa Stay
// has highlights and two Verify claims.
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

const splitStay = (
  scheduleId: ScheduleId,
  stayId: string,
  date: IsoDate,
  n = 10,
) =>
  Trip.use((trip) =>
    trip.splitStay({ scheduleId, operationId: operation(n), stayId, date }),
  )

const mergeStays = (
  scheduleId: ScheduleId,
  stayIds: readonly [string, string],
  n = 20,
) =>
  Trip.use((trip) =>
    trip.mergeStays({ scheduleId, operationId: operation(n), stayIds }),
  )

const tick = (scheduleId: ScheduleId, itemId: string) =>
  Trip.use((trip) =>
    trip.tickChecklistItem({ scheduleId, itemId, ticked: true }),
  )

/** Each Stay of a Schedule as its Base, check-in and check-out, in order. */
const staySpans = ({ stays }: ScheduleDetail) =>
  stays.map(({ base, checkIn, checkOut }) => [base.id, checkIn, checkOut])

/** The id of a Stay at an index in Trip order. */
const stayIdAt = (schedule: ScheduleDetail, index: number) =>
  schedule.stays[index]?.id ?? ''

/** Every Move of a Schedule, as its Day shows it, in Trip order. */
const movesOf = ({ days }: ScheduleDetail) =>
  days.flatMap(({ date, move }) => (move ? [{ date, ...move }] : []))

/** Option 1 with its Kyoto Stay as two, joined by a local Move. */
const option1WithTwoKyotoStays: ItineraryContent = {
  ...option1,
  stays: option1.stays.flatMap((stay) =>
    stay.base === 'kyoto'
      ? [
          { ...stay, checkOut: december(11), highlights: ['Fushimi Inari'] },
          { ...stay, checkIn: december(11), highlights: ['Kiyomizu-dera'] },
        ]
      : [stay],
  ),
  moves: [
    ...option1.moves,
    { date: december(11), mode: 'local' as const, sections: [] },
  ].sort((a, b) => a.date.localeCompare(b.date)),
}

describe('Trip.splitStay', () => {
  it.effect(
    'keeps the Stay, its Hotel details, Stay note, highlights and Verify claims on the earlier part',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const kanazawaId = stayIdAt(before, 2)
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

        const { schedule } = yield* splitStay(
          scheduleId,
          kanazawaId,
          december(16),
        )

        assert.deepStrictEqual(staySpans(schedule), [
          ['tokyo', december(6), december(9)],
          ['kyoto', december(9), december(13)],
          ['kanazawa', december(13), december(16)],
          ['kanazawa', december(16), december(17)],
          ['tokyo', december(17), december(20)],
        ])

        const [earlier, later] = schedule.stays.slice(2, 4)
        const original = before.stays[2]
        assert.deepStrictEqual(
          {
            id: earlier?.id,
            hotel: earlier?.hotel,
            note: earlier?.note,
            highlights: earlier?.highlights,
            verifyClaims: earlier?.verifyClaims,
            nights: earlier?.nights,
          },
          {
            id: kanazawaId,
            hotel: Hotel.cases.Recorded.make(details),
            note: 'Omicho market',
            highlights: original?.highlights,
            verifyClaims: original?.verifyClaims,
            nights: 3,
          },
        )
        assert.isNotEmpty(original?.highlights ?? [])
        assert.deepStrictEqual(yield* currentSchedule, schedule)

        // The later part is a new Stay, starting empty.
        assert.isFalse(
          before.stays.some((stay) => stay.id === later?.id) ||
            later?.id === undefined,
        )
        assert.deepStrictEqual(
          {
            accommodation: later?.accommodation,
            hotel: later?.hotel,
            note: later?.note,
            highlights: later?.highlights,
            verifyClaims: later?.verifyClaims,
            nights: later?.nights,
          },
          {
            accommodation: original?.accommodation,
            hotel: Hotel.cases.NotRecorded.make({}),
            note: undefined,
            highlights: [],
            verifyClaims: [],
            nights: 1,
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'joins the parts with a new local Move on the date, without rail sections or a duration',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule

        const { schedule } = yield* splitStay(
          scheduleId,
          stayIdAt(before, 1),
          december(11),
        )

        const moves = movesOf(schedule)
        const local = moves.find(({ date }) => date === december(11))
        assert.deepStrictEqual(
          moves.map(({ date, mode }) => [date, mode]),
          [
            [december(9), 'train'],
            [december(11), 'local'],
            [december(13), 'train'],
            [december(17), 'train'],
          ],
        )
        assert.deepStrictEqual(
          {
            from: local?.from.id,
            to: local?.to.id,
            sections: local?.sections,
            duration: local?.duration,
          },
          { from: 'kyoto', to: 'kyoto', sections: [], duration: undefined },
        )
        assert.isFalse(
          movesOf(before).some(({ id }) => id === local?.id) ||
            local?.id === undefined,
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps the earlier part's Book hotel tick, and adds an unticked Book hotel item for the later part, but none for the local Move",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const kyotoId = stayIdAt(before, 1)
        yield* tick(scheduleId, kyotoId)
        const itemsBefore = yield* checklistItems

        const { schedule } = yield* splitStay(scheduleId, kyotoId, december(11))

        const laterId = stayIdAt(schedule, 2)
        const items = yield* checklistItems

        const added = items.filter(
          (item) => !itemsBefore.some(({ id }) => id === item.id),
        )

        assert.deepStrictEqual(
          added.map(({ _tag, id, ticked }) => [_tag, id, ticked]),
          [['BookHotel', laterId, false]],
        )
        assert.deepStrictEqual(
          items.find(({ id }) => id === kyotoId)?.ticked,
          true,
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the Anchor warning for a Move on December 15, splitting anyway',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule

        const { schedule } = yield* splitStay(
          scheduleId,
          stayIdAt(before, 2),
          december(15),
        )

        assert.deepStrictEqual(schedule.anchorWarnings, [
          AnchorWarning.cases.MoveOnBirthday.make({}),
        ])
        assert.strictEqual(schedule.stays.length, 5)
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([trip, storage])),
  )

  const refusals: ReadonlyArray<
    readonly [reason: string, date: IsoDate, rule: HardRule]
  > = [
    [
      'on its check-in',
      december(13),
      HardRule.cases.StayWithoutNights.make({ checkIn: december(13) }),
    ],
    [
      'on its check-out',
      december(17),
      HardRule.cases.StayWithoutNights.make({ checkIn: december(17) }),
    ],
    [
      'before it',
      december(10),
      HardRule.cases.StayWithoutNights.make({ checkIn: december(13) }),
    ],
    [
      'after it',
      december(19),
      HardRule.cases.StayWithoutNights.make({ checkIn: december(19) }),
    ],
  ]

  for (const [reason, date, rule] of refusals) {
    it.effect(
      `refuses a split ${reason}, as a Stay with no nights, changing nothing`,
      () =>
        Effect.gen(function* () {
          const scheduleId = yield* choose(1, null)
          const before = yield* currentSchedule
          const itemsBefore = yield* checklistItems

          const error = yield* Effect.flip(
            splitStay(scheduleId, stayIdAt(before, 2), date),
          )

          assert.deepStrictEqual(error, new HardRuleBroken({ rule }))
          assert.deepStrictEqual(yield* currentSchedule, before)
          assert.deepStrictEqual(yield* checklistItems, itemsBefore)
        }).pipe(Effect.provide([trip, storage])),
    )
  }

  it.effect("refuses a Stay the Schedule doesn't have, changing nothing", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule

      const error = yield* Effect.flip(
        splitStay(scheduleId, 'gone', december(11)),
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
        const stayId = stayIdAt(yield* scheduleById(archived), 1)
        yield* choose(2, archived)
        const before = yield* scheduleById(archived)
        const current = yield* currentSchedule

        const error = yield* Effect.flip(
          splitStay(archived, stayId, december(11)),
        )

        assert.strictEqual(error._tag, 'ScheduleChanged')
        assert.deepStrictEqual(yield* scheduleById(archived), before)
        assert.deepStrictEqual(yield* currentSchedule, current)
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the first result without splitting again when its operation id repeats',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const kyotoId = stayIdAt(yield* currentSchedule, 1)
        const first = yield* splitStay(scheduleId, kyotoId, december(11), 2)
        const repeat = yield* splitStay(scheduleId, kyotoId, december(11), 2)
        assert.deepStrictEqual(repeat, first)
        assert.deepStrictEqual(yield* currentSchedule, first.schedule)
      }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.mergeStays', () => {
  it.effect('undoes a split, restoring the Stays and Moves', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule
      const kanazawaId = stayIdAt(before, 2)
      const split = yield* splitStay(scheduleId, kanazawaId, december(15))
      const laterId = stayIdAt(split.schedule, 3)

      const { schedule } = yield* mergeStays(scheduleId, [kanazawaId, laterId])

      assert.deepStrictEqual(schedule, before)
      assert.deepStrictEqual(yield* currentSchedule, before)
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps the earlier Stay's id and details, spanning both Stays' nights, without the Move between them",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const [earlierId, laterId] = [stayIdAt(before, 1), stayIdAt(before, 2)]

        const moveId =
          movesOf(before).find(({ date }) => date === december(11))?.id ?? ''

        for (const [stayId, name] of [
          [earlierId, 'Ryokan Sakura'],
          [laterId, 'Hotel Gion'],
        ] as const) {
          yield* Trip.use((trip) =>
            trip.writeHotelDetails({ scheduleId, stayId, details: { name } }),
          )
          yield* Trip.use((trip) =>
            trip.writeStayNote({ scheduleId, stayId, note: name }),
          )
        }

        // Given later first, as either order merges.
        const { schedule } = yield* mergeStays(scheduleId, [laterId, earlierId])

        assert.deepStrictEqual(staySpans(schedule), [
          ['tokyo', december(6), december(9)],
          ['kyoto', december(9), december(13)],
          ['kanazawa', december(13), december(17)],
          ['tokyo', december(17), december(20)],
        ])

        const merged = schedule.stays[1]
        assert.deepStrictEqual(
          {
            id: merged?.id,
            hotel: merged?.hotel,
            note: merged?.note,
            highlights: merged?.highlights,
            verifyClaims: merged?.verifyClaims,
            nights: merged?.nights,
          },
          {
            id: earlierId,
            hotel: Hotel.cases.Recorded.make({ name: 'Ryokan Sakura' }),
            note: 'Ryokan Sakura',
            highlights: ['Fushimi Inari', 'Kiyomizu-dera'],
            verifyClaims: [
              ...(before.stays[1]?.verifyClaims ?? []),
              ...(before.stays[2]?.verifyClaims ?? []),
            ],
            nights: 4,
          },
        )
        assert.isFalse(movesOf(schedule).some(({ id }) => id === moveId))
        assert.deepStrictEqual(yield* currentSchedule, schedule)
      }).pipe(Effect.provide([tripWith([option1WithTwoKyotoStays]), storage])),
  )

  it.effect(
    "removes the later Stay's Book hotel item and its tick, keeping the earlier one's",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const [earlierId, laterId] = [stayIdAt(before, 1), stayIdAt(before, 2)]
        yield* tick(scheduleId, earlierId)
        yield* tick(scheduleId, laterId)

        yield* mergeStays(scheduleId, [earlierId, laterId])

        const items = yield* checklistItems
        assert.isFalse(items.some(({ id }) => id === laterId))
        assert.deepStrictEqual(
          items.find(({ id }) => id === earlierId)?.ticked,
          true,
        )

        // Splitting again makes a new Stay, so its item starts unticked.
        const { schedule } = yield* splitStay(
          scheduleId,
          earlierId,
          december(11),
        )

        const again = (yield* checklistItems).find(
          ({ id }) => id === stayIdAt(schedule, 2),
        )

        assert.deepStrictEqual(
          [again?._tag, again?.ticked],
          ['BookHotel', false],
        )
      }).pipe(Effect.provide([tripWith([option1WithTwoKyotoStays]), storage])),
  )

  it.effect('returns the Anchor warnings the merged Schedule breaks', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, null)
      const before = yield* currentSchedule
      const kanazawaId = stayIdAt(before, 2)
      const split = yield* splitStay(scheduleId, kanazawaId, december(15))
      assert.isNotEmpty(split.schedule.anchorWarnings)

      const { schedule } = yield* mergeStays(scheduleId, [
        kanazawaId,
        stayIdAt(split.schedule, 3),
      ])

      assert.deepStrictEqual(schedule.anchorWarnings, [])
    }).pipe(Effect.provide([trip, storage])),
  )

  const refusals: ReadonlyArray<
    readonly [reason: string, stays: readonly [number, number], rule: HardRule]
  > = [
    [
      "Stays that aren't adjacent",
      [0, 3],
      HardRule.cases.StaysNotAdjacent.make({}),
    ],
    ['one Stay with itself', [1, 1], HardRule.cases.StaysNotAdjacent.make({})],
    [
      'adjacent Stays in different Bases',
      [1, 2],
      HardRule.cases.StaysInDifferentBases.make({}),
    ],
  ]

  for (const [reason, [a, b], rule] of refusals) {
    it.effect(`refuses a merge of ${reason}, changing nothing`, () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule

        const error = yield* Effect.flip(
          mergeStays(scheduleId, [stayIdAt(before, a), stayIdAt(before, b)]),
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
        mergeStays(scheduleId, [stayIdAt(before, 1), 'gone']),
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

        const split = yield* splitStay(
          archived,
          stayIdAt(yield* currentSchedule, 1),
          december(11),
        )

        yield* choose(2, archived)
        const current = yield* currentSchedule

        const error = yield* Effect.flip(
          mergeStays(archived, [
            stayIdAt(split.schedule, 1),
            stayIdAt(split.schedule, 2),
          ]),
        )

        assert.strictEqual(error._tag, 'ScheduleChanged')
        assert.deepStrictEqual(
          staySpans(yield* scheduleById(archived)),
          staySpans(split.schedule),
        )
        assert.deepStrictEqual(yield* currentSchedule, current)
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the first result when its operation id repeats, after the later Stay is gone',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, null)
        const before = yield* currentSchedule
        const stayIds = [stayIdAt(before, 1), stayIdAt(before, 2)] as const
        const first = yield* mergeStays(scheduleId, stayIds, 2)
        const repeat = yield* mergeStays(scheduleId, stayIds, 2)
        assert.deepStrictEqual(repeat, first)
      }).pipe(Effect.provide([tripWith([option1WithTwoKyotoStays]), storage])),
  )
})
