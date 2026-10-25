import { DateTime, Effect, Match, Struct } from 'effect'

import { tripStartDate } from '@/trip/domain/calendar'
import {
  ChecklistItem,
  ChecklistItemNotFound,
  IsoDate,
  OwnChecklistItemAdded,
  ScheduleAnchor,
  VerifyClaimAttachment,
} from '@/trip/domain/domain'
import type {
  AddOwnChecklistItem,
  RemoveOwnChecklistItem,
  TickChecklistItem,
  TickOwnChecklistItem,
} from '@/trip/domain/domain'
import { reminderDateOf } from '@/trip/domain/checklist-items'
import type { ScheduleCopy } from '@/trip/domain/schedule-copy'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import type {
  OwnChecklistItem,
  ScheduleStore,
} from '@/trip/schedule-store/schedule-store'
import {
  currentIn,
  namedSchedule,
  requireChecklistText,
  scheduleWrite,
  tripWrite,
} from '@/trip/trip/Trip.guards'
import { moveDetailsOf, staySummaryOf } from '@/trip/trip/Trip.shared'

const monthBefore = (date: IsoDate) =>
  IsoDate.make(
    DateTime.formatIsoDate(
      DateTime.subtract(DateTime.makeUnsafe(date), { months: 1 }),
    ),
  )

const sortedTiesAsGiven = <A>(
  items: ReadonlyArray<A>,
  compare: (a: A, b: A) => number,
) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item)

const tripOrderOnDate = {
  wholeClaim: 0,
  move: 1,
  stay: 2,
  stayClaim: 3,
  anchor: 4,
  dayClaim: 5,
}

interface DerivedEntry {
  readonly date: IsoDate
  readonly order: number
  readonly item: ChecklistItem
}

const derivedChecklistOf = (
  copy: ScheduleCopy,
  ticks: ReadonlySet<string>,
): Array<ChecklistItem> => {
  const tickOf = (id: string) => ({ id, ticked: ticks.has(id) })

  const stays = copy.stays.map((stay): DerivedEntry => ({
    date: stay.checkIn,
    order: tripOrderOnDate.stay,
    item: ChecklistItem.cases.BookHotel.make({
      ...tickOf(stay.id),
      stay: staySummaryOf(stay),
    }),
  }))

  const moves = Array.from(moveDetailsOf(copy)).flatMap(
    ([date, move]): Array<DerivedEntry> => {
      const fields = {
        ...tickOf(move.id),
        move: { date, ...Struct.pick(move, ['from', 'to']) },
      }

      const at = { date, order: tripOrderOnDate.move }

      return Match.value(move.mode).pipe(
        Match.withReturnType<Array<DerivedEntry>>(),
        Match.when('train', () => [
          {
            ...at,
            item: ChecklistItem.cases.ReserveSeats.make({
              ...fields,
              reminderDate: monthBefore(date),
              verify: 'reminder-date',
            }),
          },
        ]),
        Match.when('flight', () => [
          {
            ...at,
            item: ChecklistItem.cases.BookFlight.make({
              ...fields,
              verify: 'when-booking-opens',
            }),
          },
        ]),
        Match.when('local', () => []),
        Match.exhaustive,
      )
    },
  )

  const anchors = copy.anchors.flatMap((anchor): Array<DerivedEntry> => {
    const at = { date: anchor.date, order: tripOrderOnDate.anchor }
    const fields = { ...tickOf(anchor.id), date: anchor.date }

    return ScheduleAnchor.match<Array<DerivedEntry>>(anchor, {
      Arrival: () => [],
      ShigeharuVisit: () => [
        { ...at, item: ChecklistItem.cases.ConfirmShigeharu.make(fields) },
      ],
      Birthday: () => [
        { ...at, item: ChecklistItem.cases.ReserveBirthdayDinner.make(fields) },
      ],
      Departure: () => [],
    })
  })

  const claims = copy.verifyClaims.map((claim): DerivedEntry => ({
    ...VerifyClaimAttachment.match(claim.attachedTo, {
      Day: ({ date }) => ({ date, order: tripOrderOnDate.dayClaim }),
      Stay: ({ checkIn }) => ({
        date: checkIn,
        order: tripOrderOnDate.stayClaim,
      }),
      Itinerary: () => ({
        date: tripStartDate,
        order: tripOrderOnDate.wholeClaim,
      }),
    }),
    item: ChecklistItem.cases.VerifyClaim.make({
      ...tickOf(claim.id),
      ...Struct.pick(claim, ['text', 'attachedTo']),
    }),
  }))

  return sortedTiesAsGiven(
    [...moves, ...stays, ...anchors, ...claims],
    (a, b) => a.date.localeCompare(b.date) || a.order - b.order,
  ).map(({ item }) => item)
}

const checklistGroups = { undatedDerived: 0, dated: 1, undatedOwn: 2 }

const checklistGroupOf = (item: ChecklistItem) =>
  reminderDateOf(item) !== undefined
    ? checklistGroups.dated
    : ChecklistItem.guards.Own(item)
      ? checklistGroups.undatedOwn
      : checklistGroups.undatedDerived

const checklistOf = (
  derived: ReadonlyArray<ChecklistItem>,
  own: ReadonlyArray<OwnChecklistItem>,
): Array<ChecklistItem> =>
  sortedTiesAsGiven(
    [
      ...derived,
      ...own.map(({ reminderDate, ...item }) =>
        ChecklistItem.cases.Own.make({
          ...item,
          ...(reminderDate !== null && { reminderDate }),
        }),
      ),
    ],
    (a, b) =>
      checklistGroupOf(a) - checklistGroupOf(b) ||
      (reminderDateOf(a) ?? '').localeCompare(reminderDateOf(b) ?? ''),
  )

/**
 * The Checklist of `current`, the current Schedule as `store` just read it,
 * inside the caller's transaction.
 */
export const checklistIn = Effect.fnUntraced(function* (
  store: ScheduleStore,
  { schedule, copy }: Effect.Success<ReturnType<typeof currentIn>>,
) {
  const derived = derivedChecklistOf(copy, yield* store.ticks(schedule.id))

  return {
    scheduleId: schedule.id,
    items: checklistOf(derived, yield* store.ownItems),
  }
})

const checklist = Effect.gen(function* () {
  const store = yield* scheduleStore

  return yield* store.transaction(
    Effect.flatMap(currentIn(store), (current) => checklistIn(store, current)),
  )
}).pipe(
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  Effect.withSpan('Trip.checklist'),
)

const tickChecklistItem = Effect.fn('Trip.tickChecklistItem')(function* ({
  scheduleId,
  itemId,
  ticked,
}: TickChecklistItem) {
  yield* scheduleWrite({ naming: scheduleId }, (store) =>
    Effect.gen(function* () {
      const { copy } = yield* namedSchedule(store, scheduleId)

      const derives = derivedChecklistOf(copy, new Set()).some(
        (item) => item.id === itemId,
      )

      if (!derives) return yield* new ChecklistItemNotFound({ itemId })
      yield* store.writeTick(scheduleId, itemId, ticked)
    }),
  )
})

const addOwnChecklistItem = Effect.fn('Trip.addOwnChecklistItem')(function* ({
  operationId,
  text,
  reminderDate,
}: AddOwnChecklistItem) {
  const trimmed = yield* requireChecklistText(text)

  return yield* tripWrite(
    { recorded: { operationId, result: OwnChecklistItemAdded } },
    (store) => {
      const itemId = crypto.randomUUID()

      return Effect.as(
        store.addOwnItem(itemId, trimmed, reminderDate ?? null),
        { itemId },
      )
    },
  )
})

const tickOwnChecklistItem = Effect.fn('Trip.tickOwnChecklistItem')(function* ({
  itemId,
  ticked,
}: TickOwnChecklistItem) {
  yield* tripWrite({}, (store) =>
    Effect.gen(function* () {
      if (!(yield* store.writeOwnTick(itemId, ticked))) {
        return yield* new ChecklistItemNotFound({ itemId })
      }
    }),
  )
})

const removeOwnChecklistItem = Effect.fn('Trip.removeOwnChecklistItem')(
  function* ({ itemId }: RemoveOwnChecklistItem) {
    yield* tripWrite({}, (store) => store.removeOwnItem(itemId))
  },
)

/** The Checklist read, its ticks and Phillip's own items. */
export const checklistMethods = Effect.succeed({
  checklist,
  tickChecklistItem,
  addOwnChecklistItem,
  tickOwnChecklistItem,
  removeOwnChecklistItem,
})
