import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { AnchorWarning, december } from '@/trip/domain/domain'
import type {
  ItineraryContent,
  IsoDate,
  ScheduleDetail,
  Stay,
} from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import {
  checklistItems,
  currentSchedule,
  currentScheduleId,
  operation,
  scheduleById,
  stayIdAt,
  storage,
  storageStartingFrom,
  tick,
  tripWith,
  tripWithOption1,
} from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

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
      assert.deepStrictEqual((yield* currentSchedule).anchorWarnings, [])
    }).pipe(Effect.provide([tripWithOption1, storage])),
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
          const scheduleId = yield* currentScheduleId
          assert.deepStrictEqual(
            (yield* currentSchedule).anchorWarnings,
            warnings,
          )
          assert.deepStrictEqual(
            (yield* scheduleById(scheduleId)).anchorWarnings,
            warnings,
          )
        }).pipe(
          Effect.provide([tripWith([content]), storageStartingFrom(content)]),
        ),
    )
  }
})

const moveIdOn = (schedule: ScheduleDetail, date: IsoDate) =>
  schedule.days.find((day) => day.date === date)?.move?.id ?? ''

describe('Stay edits', () => {
  it.effect(
    'drop the Checklist items and ticks of the Stay and Move they remove, keeping the ticks of the rest',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* currentScheduleId
        const before = yield* currentSchedule
        const [kyotoId, kanazawaId] = [stayIdAt(before, 1), stayIdAt(before, 2)]
        const into = moveIdOn(before, december(13))
        const outOf = moveIdOn(before, december(17))

        for (const itemId of [kyotoId, kanazawaId, into, outOf]) {
          yield* tick(scheduleId, itemId)
        }

        yield* Trip.use((trip) =>
          trip.changeStayBase({
            scheduleId,
            stayId: kanazawaId,
            place: 'kyoto',
          }),
        )

        const { schedule } = yield* Trip.use((trip) =>
          trip.mergeStays({
            scheduleId,
            operationId: operation(2),
            stayIds: [kyotoId, kanazawaId],
          }),
        )

        assert.deepStrictEqual(
          schedule.stays.map(({ base, checkIn, checkOut }) => [
            base.id,
            checkIn,
            checkOut,
          ]),
          [
            ['tokyo', december(6), december(9)],
            ['kyoto', december(9), december(17)],
            ['tokyo', december(17), december(20)],
          ],
        )
        assert.deepStrictEqual(schedule.stays[1]?.verifyClaims, [
          ...(before.stays[1]?.verifyClaims ?? []),
          ...(before.stays[2]?.verifyClaims ?? []),
        ])

        const ticked = (yield* checklistItems)
          .filter((item) => item.ticked)
          .map((item) => item.id)

        assert.sameMembers(ticked, [kyotoId, outOf])
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
