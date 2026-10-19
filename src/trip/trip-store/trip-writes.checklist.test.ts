import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import {
  AddOwnChecklistItemOutcome,
  ChecklistItem,
  RemoveOwnChecklistItemOutcome,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
} from '@/trip/domain/domain'
import { checklistTextMaxLength } from '@/trip/domain/limits'
import {
  checklistItems,
  choose,
  kyotoStayId,
  operation,
  storage,
  tripWithOption1,
} from '@/trip/trip/testing'
import { runTripWrite } from '@/trip/trip-store/trip-writes'

const tickedIds = Effect.map(checklistItems, (items) =>
  items.filter(({ ticked }) => ticked).map(({ id }) => id),
)

const ownItems = Effect.map(checklistItems, (items) =>
  items.filter(ChecklistItem.guards.Own).map(({ id, text }) => ({ id, text })),
)

const addOwn = (n: number, text: string) =>
  runTripWrite('addOwnChecklistItem', { operationId: operation(n), text })

describe('runTripWrite for a Tick', () => {
  it.effect(
    'answers a Tick on an item derived from the Schedule with Ticked',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const itemId = yield* kyotoStayId(scheduleId)

        const outcome = yield* runTripWrite('tickChecklistItem', {
          scheduleId,
          itemId,
          ticked: true,
        })

        assert.deepStrictEqual(
          { outcome, ticked: yield* tickedIds },
          {
            outcome: TickChecklistItemOutcome.cases.Ticked.make({}),
            ticked: [itemId],
          },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'answers an item nothing in the Schedule derives with ChecklistItemNotFound and its id',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)

        const outcome = yield* runTripWrite('tickChecklistItem', {
          scheduleId,
          itemId: 'no-such-item',
          ticked: true,
        })

        assert.deepStrictEqual(
          outcome,
          TickChecklistItemOutcome.cases.ChecklistItemNotFound.make({
            itemId: 'no-such-item',
          }),
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('answers a Tick on an Own Checklist item with Ticked', () =>
    Effect.gen(function* () {
      const [own] = yield* Effect.andThen(addOwn(1, 'Buy a SIM'), ownItems)
      const itemId = own?.id ?? ''

      const outcome = yield* runTripWrite('tickOwnChecklistItem', {
        itemId,
        ticked: true,
      })

      assert.deepStrictEqual(
        { outcome, ticked: yield* tickedIds },
        {
          outcome: TickOwnChecklistItemOutcome.cases.Ticked.make({}),
          ticked: [itemId],
        },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'answers a Tick on an Own Checklist item that is gone with ChecklistItemNotFound and its id',
    () =>
      Effect.gen(function* () {
        const outcome = yield* runTripWrite('tickOwnChecklistItem', {
          itemId: 'no-such-item',
          ticked: true,
        })

        assert.deepStrictEqual(
          outcome,
          TickOwnChecklistItemOutcome.cases.ChecklistItemNotFound.make({
            itemId: 'no-such-item',
          }),
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})

describe('runTripWrite for an Own Checklist item', () => {
  it.effect('answers an added Own Checklist item with Added and its id', () =>
    Effect.gen(function* () {
      const outcome = yield* addOwn(1, 'Buy a SIM')
      const [own] = yield* ownItems

      assert.deepStrictEqual(
        { outcome, own: yield* ownItems },
        {
          outcome: AddOwnChecklistItemOutcome.cases.Added.make({
            itemId: own?.id ?? '',
          }),
          own: [{ id: own?.id ?? '', text: 'Buy a SIM' }],
        },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect(
    'answers blank or too long text with ChecklistTextInvalid and the limit',
    () =>
      Effect.gen(function* () {
        const outcomes = [
          yield* addOwn(1, '   '),
          yield* addOwn(2, 'あ'.repeat(checklistTextMaxLength + 1)),
        ]

        assert.deepStrictEqual(
          { outcomes, own: yield* ownItems },
          {
            outcomes: [
              AddOwnChecklistItemOutcome.cases.ChecklistTextInvalid.make({
                maxLength: checklistTextMaxLength,
              }),
              AddOwnChecklistItemOutcome.cases.ChecklistTextInvalid.make({
                maxLength: checklistTextMaxLength,
              }),
            ],
            own: [],
          },
        )
      }).pipe(Effect.provide([tripWithOption1, storage])),
  )

  it.effect('answers a removed Own Checklist item with Removed', () =>
    Effect.gen(function* () {
      const [own] = yield* Effect.andThen(addOwn(1, 'Buy a SIM'), ownItems)

      const outcome = yield* runTripWrite('removeOwnChecklistItem', {
        itemId: own?.id ?? '',
      })

      assert.deepStrictEqual(
        { outcome, own: yield* ownItems },
        {
          outcome: RemoveOwnChecklistItemOutcome.cases.Removed.make({}),
          own: [],
        },
      )
    }).pipe(Effect.provide([tripWithOption1, storage])),
  )
})
