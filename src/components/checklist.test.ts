// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import {
  useChecklistItemRemoval,
  useNewChecklistItem,
  useTick,
} from '@/components/checklist'
import {
  AddOwnChecklistItemOutcome,
  ChecklistItem,
  IsoDate,
  RemoveOwnChecklistItemOutcome,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
} from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  answeringOnlyUnderAnyOperation,
  comeBackOnline,
  goOffline,
  losingFirstAnswer,
  notSavedProblem,
  openEditor,
} from '@/trip/client/editor-testing'
import {
  addOwnChecklistItem,
  removeOwnChecklistItem,
  tickChecklistItem,
  tickOwnChecklistItem,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  addOwnChecklistItem: vi.fn(),
  removeOwnChecklistItem: vi.fn(),
  tickChecklistItem: vi.fn(),
  tickOwnChecklistItem: vi.fn(),
}))

const jrPass = ChecklistItem.cases.Own.make({
  id: 'item-jr-pass',
  ticked: false,
  text: 'Buy a JR Pass',
})

const shigeharu = ChecklistItem.cases.ConfirmShigeharu.make({
  id: 'shigeharu',
  ticked: false,
  date: IsoDate.make('2026-12-11'),
})

// A Checklist write is confirmed by the next read of the Checklist, which
// the page here never shows, so a value sent stays Saved.
const sentTicked = SaveState.Saved({ value: true })

describe('a Tick', () => {
  /** The Tick of `item`. */
  const openTick = (item: ChecklistItem) =>
    openEditor(({ item }: { item: ChecklistItem }) => useTick({ item }), {
      item,
    })

  it('ticks an own Checklist item on the Trip', async () => {
    vi.mocked(tickOwnChecklistItem).mockImplementation(
      answeringOnly(
        { itemId: 'item-jr-pass', ticked: true },
        TickOwnChecklistItemOutcome.cases.Ticked.make({}),
        TickOwnChecklistItemOutcome.cases.ChecklistItemNotFound.make({
          itemId: 'item-jr-pass',
        }),
      ),
    )
    const editor = await openTick(jrPass)

    await act(() => editor.field().send(true))

    assert.deepStrictEqual(editor.field().state, sentTicked)
    await editor.close()
  })

  it('ticks an item derived from the Schedule', async () => {
    vi.mocked(tickChecklistItem).mockImplementation(
      answeringOnly(
        { itemId: 'shigeharu', ticked: true },
        TickChecklistItemOutcome.cases.Ticked.make({}),
        TickChecklistItemOutcome.cases.ChecklistItemNotFound.make({
          itemId: 'shigeharu',
        }),
      ),
    )
    const editor = await openTick(shigeharu)

    await act(() => editor.field().send(true))

    assert.deepStrictEqual(editor.field().state, sentTicked)
    await editor.close()
  })

  it('sends no Tick while offline, and ticks once the connection returns', async () => {
    vi.mocked(tickOwnChecklistItem).mockImplementation(
      answeringOnly(
        { itemId: 'item-jr-pass', ticked: true },
        TickOwnChecklistItemOutcome.cases.Ticked.make({}),
        TickOwnChecklistItemOutcome.cases.ChecklistItemNotFound.make({
          itemId: 'item-jr-pass',
        }),
      ),
    )
    const editor = await openTick(jrPass)

    await goOffline()
    await act(() => editor.field().send(true))
    const offline = editor.field()
    await comeBackOnline()
    await act(() => editor.field().send(true))
    const online = editor.field()

    assert.deepStrictEqual(
      [
        { paused: offline.paused, state: offline.state },
        { paused: online.paused, state: online.state },
      ],
      [
        { paused: true, state: SaveState.Clean({ justSaved: false }) },
        { paused: false, state: sentTicked },
      ],
    )
    await editor.close()
  })

  it('drops a Tick not saved once the Checklist shows the item ticked after all', async () => {
    vi.mocked(tickOwnChecklistItem).mockRejectedValue(new Error('offline'))
    const editor = await openTick(jrPass)
    await act(() => editor.field().send(true))
    assert.isTrue(SaveState.$is('NotSaved')(editor.field().state))

    await editor.show({ item: { ...jrPass, ticked: true } })

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: false }),
    )
    await editor.close()
  })
})

describe('removing an own Checklist item', () => {
  it('removes it from the Trip', async () => {
    // Removing answers only Removed, so another item gets no answer at all.
    vi.mocked(removeOwnChecklistItem).mockImplementation(async ({ data }) => {
      if (data.itemId !== 'item-jr-pass') throw new Error('No such item')

      return RemoveOwnChecklistItemOutcome.cases.Removed.make({})
    })

    const editor = await openEditor(
      () => useChecklistItemRemoval({ itemId: 'item-jr-pass' }),
      {},
    )

    await act(() => editor.field().send('item-jr-pass'))

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Saved({ value: 'item-jr-pass' }),
    )
    await editor.close()
  })
})

describe('adding an own Checklist item', () => {
  const openNewItem = () => openEditor(() => useNewChecklistItem(), {})

  it('adds the item with its Reminder date to the Trip', async () => {
    localStorage.clear()
    const editor = await openNewItem()

    await act(async () =>
      editor.field().change({
        ...editor.field().value,
        text: 'Buy a JR Pass',
        reminderDate: '2026-11-06',
      }),
    )
    vi.mocked(addOwnChecklistItem).mockImplementation(
      answeringOnlyUnderAnyOperation(
        { text: 'Buy a JR Pass', reminderDate: '2026-11-06' },
        AddOwnChecklistItemOutcome.cases.Added.make({ itemId: 'item-1' }),
        AddOwnChecklistItemOutcome.cases.ChecklistTextInvalid.make({
          maxLength: 200,
        }),
      ),
    )
    await act(() => editor.field().save())

    assert.isTrue(SaveState.$is('Saved')(editor.field().state))
    await editor.close()
  })

  it('adds the item once when Retry follows an add whose answer was lost', async () => {
    localStorage.clear()
    vi.mocked(addOwnChecklistItem).mockImplementation(
      losingFirstAnswer(
        (retry, first) => retry.operationId === first.operationId,
        AddOwnChecklistItemOutcome.cases.Added.make({ itemId: 'item-1' }),
        // Any answer but Added. Getting it means the item was added twice.
        AddOwnChecklistItemOutcome.cases.ChecklistTextInvalid.make({
          maxLength: 200,
        }),
      ),
    )
    const editor = await openNewItem()

    await act(async () =>
      editor.field().change({ ...editor.field().value, text: 'Buy a JR Pass' }),
    )
    await act(() => editor.field().save())
    await act(() => editor.field().save())

    assert.isTrue(SaveState.$is('Saved')(editor.field().state))
    await editor.close()
  })

  it('keeps a Reminder date without a four-digit year marked "not saved", without sending it', async () => {
    localStorage.clear()
    // Were it sent, it would be added.
    vi.mocked(addOwnChecklistItem).mockResolvedValue(
      AddOwnChecklistItemOutcome.cases.Added.make({ itemId: 'item-1' }),
    )
    const editor = await openNewItem()

    await act(async () =>
      editor.field().change({
        ...editor.field().value,
        text: 'Buy a JR Pass',
        reminderDate: '20261-11-06',
      }),
    )
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'Choose a reminder date with a four-digit year.',
    )
    await editor.close()
  })

  it('keeps text that is too long marked "not saved", saying how long it can be', async () => {
    localStorage.clear()
    vi.mocked(addOwnChecklistItem).mockResolvedValue(
      AddOwnChecklistItemOutcome.cases.ChecklistTextInvalid.make({
        maxLength: 200,
      }),
    )
    const editor = await openNewItem()

    await act(async () =>
      editor.field().change({ ...editor.field().value, text: 'Buy a JR Pass' }),
    )
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'An item needs some text, at most 200 characters.',
    )
    await editor.close()
  })
})
