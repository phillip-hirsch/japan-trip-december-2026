import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Predicate } from 'effect'

import {
  ChecklistItem,
  december,
  IsoDate,
  VerifyClaimAttachment,
} from '@/trip/domain'
import type { ItineraryContent, ScheduleId } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { operation, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

/**
 * Option 1 flying home from Kanazawa, then changing hotels in Tokyo on
 * December 19 with a local Move, and with a Verify claim about the whole.
 */
const withEveryKindOfItem: ItineraryContent = {
  ...option1,
  stays: [
    ...option1.stays.slice(0, 3),
    {
      base: 'tokyo',
      checkIn: december(17),
      checkOut: december(19),
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'tokyo',
      checkIn: december(19),
      checkOut: december(20),
      accommodation: 'hotel',
      highlights: [],
    },
  ],
  moves: [
    ...option1.moves.slice(0, 2),
    { date: december(17), mode: 'flight', sections: [] },
    { date: december(19), mode: 'local', sections: [] },
  ],
  verifyClaims: [
    ...option1.verifyClaims,
    {
      id: 'rail-pass',
      text: 'Rail pass prices change in October.',
      attachedTo: VerifyClaimAttachment.cases.Itinerary.make({}),
    },
  ],
}

/** Option 1 as it is, as Option 2. */
const plainOption1: ItineraryContent = { ...option1, optionNumber: 2 }

const trip = tripWith([withEveryKindOfItem, plainOption1])

/** Chooses an Itinerary, replacing the Schedule named, if any. */
const choose = (
  optionNumber: number,
  n: number,
  replacing: ScheduleId | null,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

const restore = (scheduleId: ScheduleId, n: number, replacing: ScheduleId) =>
  Trip.use((trip) =>
    trip.restore({ operationId: operation(n), scheduleId, replacing }),
  )

const checklist = Trip.use((trip) => trip.checklist)

/** One item in glossary terms, as /checklist would read it. */
const described = (item: ChecklistItem) => {
  const tick = item.ticked ? '[x]' : '[ ]'

  const what = ChecklistItem.match(item, {
    BookHotel: ({ stay }) =>
      `Book hotel: ${stay.base.romaji} ${stay.checkIn} to ${stay.checkOut}`,
    ReserveSeats: ({ move, reminderDate, verify }) =>
      `Reserve seats: ${move.from.romaji} to ${move.to.romaji} on ${move.date}, reminded ${reminderDate}, verify ${verify}`,
    BookFlight: ({ move, verify }) =>
      `Book flight: ${move.from.romaji} to ${move.to.romaji} on ${move.date}, verify ${verify}`,
    ConfirmShigeharu: ({ date }) => `Confirm Shigeharu is open ${date}`,
    ReserveBirthdayDinner: ({ date }) => `Reserve birthday dinner ${date}`,
    VerifyClaim: ({ text, attachedTo }) =>
      `Verify (${VerifyClaimAttachment.match(attachedTo, {
        Day: ({ date }) => `Day ${date}`,
        Stay: ({ checkIn }) => `Stay ${checkIn}`,
        Itinerary: () => 'whole',
      })}): ${text.split(' ').slice(0, 3).join(' ')}`,
    Own: ({ text, reminderDate }) =>
      reminderDate === undefined
        ? `Own: ${text}`
        : `Own: ${text}, reminded ${reminderDate}`,
  })

  return `${tick} ${what}`
}

const describedChecklist = Effect.map(checklist, ({ items }) =>
  items.map(described),
)

/** The id of the first item a predicate matches. */
const idOf = (matches: (item: ChecklistItem) => boolean) =>
  Effect.map(checklist, ({ items }) => items.find(matches)?.id ?? '')

const tick = (scheduleId: ScheduleId, itemId: string, ticked: boolean) =>
  Trip.use((trip) => trip.tickChecklistItem({ scheduleId, itemId, ticked }))

const addOwn = (n: number, text: string, reminderDate?: IsoDate) =>
  Trip.use((trip) =>
    trip.addOwnChecklistItem({
      operationId: operation(n),
      text,
      ...(reminderDate && { reminderDate }),
    }),
  )

const tickOwn = (itemId: string, ticked: boolean) =>
  Trip.use((trip) => trip.tickOwnChecklistItem({ itemId, ticked }))

const removeOwn = (itemId: string) =>
  Trip.use((trip) => trip.removeOwnChecklistItem({ itemId }))

describe('Trip.checklist', () => {
  it.effect(
    'derives an item for each Stay, train and flight Move, the Shigeharu visit, the Birthday and each Verify claim',
    () =>
      Effect.gen(function* () {
        yield* choose(1, 1, null)
        assert.deepStrictEqual(yield* describedChecklist, [
          '[ ] Verify (whole): Rail pass prices',
          '[ ] Book hotel: Tokyo 2026-12-06 to 2026-12-09',
          '[ ] Book hotel: Kyoto 2026-12-09 to 2026-12-13',
          '[ ] Confirm Shigeharu is open 2026-12-11',
          '[ ] Verify (Day 2026-12-11): Recent visitor reports',
          '[ ] Book hotel: Kanazawa 2026-12-13 to 2026-12-17',
          '[ ] Verify (Stay 2026-12-13): December also falls',
          '[ ] Verify (Stay 2026-12-13): Kanazawa can be',
          '[ ] Reserve birthday dinner 2026-12-15',
          '[ ] Book flight: Kanazawa to Tokyo on 2026-12-17, verify when-booking-opens',
          '[ ] Book hotel: Tokyo 2026-12-17 to 2026-12-19',
          '[ ] Book hotel: Tokyo 2026-12-19 to 2026-12-20',
          '[ ] Reserve seats: Tokyo to Kyoto on 2026-12-09, reminded 2026-11-09, verify reminder-date',
          '[ ] Reserve seats: Kyoto to Kanazawa on 2026-12-13, reminded 2026-11-13, verify reminder-date',
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('derives no item from a local Move', () =>
    Effect.gen(function* () {
      yield* choose(1, 1, null)
      const { items } = yield* checklist

      assert.deepStrictEqual(
        items.flatMap((item) =>
          'move' in item && item.move.date === december(19) ? [item] : [],
        ),
        [],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'orders by reminder date, then Trip order, with own items without one last',
    () =>
      Effect.gen(function* () {
        yield* addOwn(1, 'Pack the coin purse')
        yield* addOwn(2, 'Buy a Suica', IsoDate.make('2026-11-10'))
        yield* addOwn(3, 'Check the JR app', december(1))
        yield* addOwn(
          4,
          'Print the hotel addresses',
          IsoDate.make('2026-11-09'),
        )
        yield* addOwn(5, 'Pack the rail pass')
        yield* choose(2, 6, null)

        assert.deepStrictEqual(yield* describedChecklist, [
          '[ ] Book hotel: Tokyo 2026-12-06 to 2026-12-09',
          '[ ] Book hotel: Kyoto 2026-12-09 to 2026-12-13',
          '[ ] Confirm Shigeharu is open 2026-12-11',
          '[ ] Verify (Day 2026-12-11): Recent visitor reports',
          '[ ] Book hotel: Kanazawa 2026-12-13 to 2026-12-17',
          '[ ] Verify (Stay 2026-12-13): December also falls',
          '[ ] Verify (Stay 2026-12-13): Kanazawa can be',
          '[ ] Reserve birthday dinner 2026-12-15',
          '[ ] Book hotel: Tokyo 2026-12-17 to 2026-12-20',
          '[ ] Reserve seats: Tokyo to Kyoto on 2026-12-09, reminded 2026-11-09, verify reminder-date',
          '[ ] Own: Print the hotel addresses, reminded 2026-11-09',
          '[ ] Own: Buy a Suica, reminded 2026-11-10',
          '[ ] Reserve seats: Kyoto to Kanazawa on 2026-12-13, reminded 2026-11-13, verify reminder-date',
          '[ ] Reserve seats: Kanazawa to Tokyo on 2026-12-17, reminded 2026-11-17, verify reminder-date',
          '[ ] Own: Check the JR app, reminded 2026-12-01',
          '[ ] Own: Pack the coin purse',
          '[ ] Own: Pack the rail pass',
        ])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('shows only Phillip’s own items before a Schedule is chosen', () =>
    Effect.gen(function* () {
      yield* addOwn(1, 'Renew the passport', IsoDate.make('2026-10-20'))
      const { scheduleId, items } = yield* checklist

      assert.deepStrictEqual(
        { scheduleId, items: items.map(described) },
        {
          scheduleId: null,
          items: ['[ ] Own: Renew the passport, reminded 2026-10-20'],
        },
      )
    }).pipe(Effect.provide([storage, trip])),
  )

  it.effect('names the current Schedule', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      assert.strictEqual((yield* checklist).scheduleId, scheduleId)
    }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Trip.tickChecklistItem', () => {
  it.effect('sets the tick to true or false, never toggling it', () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const itemId = yield* idOf(ChecklistItem.guards.ConfirmShigeharu)
      yield* tick(scheduleId, itemId, true)
      yield* tick(scheduleId, itemId, true)

      const twiceTicked = (yield* describedChecklist).filter((item) =>
        item.startsWith('[x]'),
      )

      yield* tick(scheduleId, itemId, false)
      yield* tick(scheduleId, itemId, false)

      assert.deepStrictEqual(
        {
          twiceTicked,
          twiceUnticked: (yield* describedChecklist).filter((item) =>
            item.startsWith('[x]'),
          ),
        },
        {
          twiceTicked: ['[x] Confirm Shigeharu is open 2026-12-11'],
          twiceUnticked: [],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a tick naming a stale Schedule id with ScheduleChanged',
    () =>
      Effect.gen(function* () {
        const stale = yield* choose(1, 1, null)
        const staleItemId = yield* idOf(ChecklistItem.guards.BookHotel)
        // Another device chooses again, so this screen's Schedule is stale.
        yield* choose(1, 2, stale)
        const error = yield* Effect.flip(tick(stale, staleItemId, true))

        assert.deepStrictEqual(
          {
            tag: error._tag,
            ticked: (yield* describedChecklist).filter((item) =>
              item.startsWith('[x]'),
            ),
          },
          { tag: 'ScheduleChanged', ticked: [] },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'rejects a tick on an archived Schedule, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        const itemId = yield* idOf(ChecklistItem.guards.BookHotel)
        yield* tick(archived, itemId, true)
        const current = yield* choose(2, 2, archived)
        const error = yield* Effect.flip(tick(archived, itemId, false))
        yield* restore(archived, 3, current)

        assert.deepStrictEqual(
          {
            tag: error._tag,
            ticked: (yield* describedChecklist).filter((item) =>
              item.startsWith('[x]'),
            ),
          },
          {
            tag: 'ScheduleChanged',
            ticked: ['[x] Book hotel: Tokyo 2026-12-06 to 2026-12-09'],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'fails with ChecklistItemNotFound for an item the Schedule lacks',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, 1, null)
        const goneItemId = yield* idOf(ChecklistItem.guards.BookHotel)
        const current = yield* choose(1, 2, first)
        const error = yield* Effect.flip(tick(current, goneItemId, true))

        assert.deepStrictEqual(
          {
            tag: error._tag,
            itemId: Predicate.isTagged('ChecklistItemNotFound')(error)
              ? error.itemId
              : '',
          },
          { tag: 'ChecklistItemNotFound', itemId: goneItemId },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'keeps ticks with their Schedule: not carried into a new one, back on restoring',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, 1, null)
        yield* tick(first, yield* idOf(ChecklistItem.guards.BookHotel), true)
        yield* tick(
          first,
          yield* idOf(ChecklistItem.guards.ReserveBirthdayDinner),
          true,
        )
        const second = yield* choose(1, 2, first)

        const afterChoosing = (yield* describedChecklist).filter((item) =>
          item.startsWith('[x]'),
        )

        yield* restore(first, 3, second)

        assert.deepStrictEqual(
          {
            afterChoosing,
            afterRestoring: (yield* describedChecklist).filter((item) =>
              item.startsWith('[x]'),
            ),
          },
          {
            afterChoosing: [],
            afterRestoring: [
              '[x] Book hotel: Tokyo 2026-12-06 to 2026-12-09',
              '[x] Reserve birthday dinner 2026-12-15',
            ],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )
})

describe('Phillip’s own Checklist items', () => {
  it.effect('carry over, ticks included, on choosing again', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      const { itemId } = yield* addOwn(2, 'Buy a Suica', december(1))
      yield* addOwn(3, 'Pack the coin purse')
      yield* tickOwn(itemId, true)
      yield* choose(2, 4, first)
      const { items } = yield* checklist

      assert.deepStrictEqual(
        items.filter(ChecklistItem.guards.Own).map(described),
        [
          '[x] Own: Buy a Suica, reminded 2026-12-01',
          '[ ] Own: Pack the coin purse',
        ],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'returns the recorded result for a repeated create operation id, adding nothing',
    () =>
      Effect.gen(function* () {
        const added = yield* addOwn(1, 'Buy a Suica')
        const repeated = yield* addOwn(1, 'Buy a Suica')

        assert.deepStrictEqual(
          { repeated, items: (yield* describedChecklist).length },
          { repeated: added, items: 1 },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('tick and untick', () =>
    Effect.gen(function* () {
      const { itemId } = yield* addOwn(1, 'Buy a Suica')
      yield* tickOwn(itemId, true)
      const ticked = yield* describedChecklist
      yield* tickOwn(itemId, false)

      assert.deepStrictEqual(
        { ticked, unticked: yield* describedChecklist },
        {
          ticked: ['[x] Own: Buy a Suica'],
          unticked: ['[ ] Own: Buy a Suica'],
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('are removed, and removing one already gone changes nothing', () =>
    Effect.gen(function* () {
      const { itemId } = yield* addOwn(1, 'Buy a Suica')
      yield* addOwn(2, 'Pack the coin purse')
      yield* removeOwn(itemId)
      yield* removeOwn(itemId)
      assert.deepStrictEqual(yield* describedChecklist, [
        '[ ] Own: Pack the coin purse',
      ])
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('fail to tick with ChecklistItemNotFound once removed', () =>
    Effect.gen(function* () {
      const { itemId } = yield* addOwn(1, 'Buy a Suica')
      yield* removeOwn(itemId)
      const error = yield* Effect.flip(tickOwn(itemId, true))
      assert.deepStrictEqual(
        { tag: error._tag, itemId: error.itemId },
        { tag: 'ChecklistItemNotFound', itemId },
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'are saved trimmed, refusing blank text or more than 500 characters',
    () =>
      Effect.gen(function* () {
        yield* addOwn(1, '  Buy a Suica\n')
        const blank = yield* Effect.flip(addOwn(2, ' \n '))
        yield* addOwn(3, 'あ'.repeat(500))
        const tooLong = yield* Effect.flip(addOwn(4, 'あ'.repeat(501)))
        const { items } = yield* checklist

        assert.deepStrictEqual(
          {
            blank: blank.maxLength,
            tooLong: tooLong.maxLength,
            texts: items.map((item) => ('text' in item ? item.text.length : 0)),
            first: Option.fromUndefinedOr(items[0]).pipe(
              Option.map(described),
              Option.getOrUndefined,
            ),
          },
          {
            blank: 500,
            tooLong: 500,
            texts: [11, 500],
            first: '[ ] Own: Buy a Suica',
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )
})
