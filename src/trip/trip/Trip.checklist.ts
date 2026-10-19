import { DateTime, Effect, Match, Option, Struct } from 'effect'

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
import type { OwnChecklistItem } from '@/trip/schedule-store/schedule-store'
import { requireChecklistText, requireCurrent } from '@/trip/trip/Trip.guards'
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

const checklist = Effect.gen(function* () {
  const store = yield* scheduleStore

  return yield* store.transaction(
    Effect.gen(function* () {
      const current = yield* store.current

      const derived = Option.isSome(current)
        ? derivedChecklistOf(
            current.value.copy,
            yield* store.ticks(current.value.schedule.id),
          )
        : []

      return {
        scheduleId: Option.getOrNull(
          Option.map(current, ({ schedule }) => schedule.id),
        ),
        items: checklistOf(derived, yield* store.ownItems),
      }
    }),
  )
}).pipe(
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  Effect.withSpan('Trip.checklist'),
)

const tickChecklistItem = Effect.fn('Trip.tickChecklistItem')(
  function* ({ scheduleId, itemId, ticked }: TickChecklistItem) {
    const store = yield* scheduleStore
    yield* store.transaction(
      Effect.gen(function* () {
        yield* requireCurrent(store, scheduleId)
        const found = yield* store.scheduleById(scheduleId)

        const derives = Option.exists(found, ({ copy }) =>
          derivedChecklistOf(copy, new Set()).some(
            (item) => item.id === itemId,
          ),
        )

        if (!derives) return yield* new ChecklistItemNotFound({ itemId })
        yield* store.writeTick(scheduleId, itemId, ticked)
      }),
    )
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

const addOwnChecklistItem = Effect.fn('Trip.addOwnChecklistItem')(
  function* ({ operationId, text, reminderDate }: AddOwnChecklistItem) {
    const trimmed = yield* requireChecklistText(text)
    const store = yield* scheduleStore

    return yield* store.transaction(
      Effect.gen(function* () {
        const recorded = yield* store.recordedResult(OwnChecklistItemAdded)(
          operationId,
        )

        if (Option.isSome(recorded)) return recorded.value.result
        const added = { itemId: crypto.randomUUID() }
        yield* store.addOwnItem(added.itemId, trimmed, reminderDate ?? null)
        yield* store.recordResult(OwnChecklistItemAdded)({
          id: operationId,
          result: added,
        })

        return added
      }),
    )
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

const tickOwnChecklistItem = Effect.fn('Trip.tickOwnChecklistItem')(
  function* ({ itemId, ticked }: TickOwnChecklistItem) {
    const store = yield* scheduleStore

    if (!(yield* store.writeOwnTick(itemId, ticked))) {
      return yield* new ChecklistItemNotFound({ itemId })
    }
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

const removeOwnChecklistItem = Effect.fn('Trip.removeOwnChecklistItem')(
  function* ({ itemId }: RemoveOwnChecklistItem) {
    const store = yield* scheduleStore
    yield* store.removeOwnItem(itemId)
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

/** The Checklist read, its ticks and Phillip's own items. */
export const checklistMethods = Effect.succeed({
  checklist,
  tickChecklistItem,
  addOwnChecklistItem,
  tickOwnChecklistItem,
  removeOwnChecklistItem,
})
