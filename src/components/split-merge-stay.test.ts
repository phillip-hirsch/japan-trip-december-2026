// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useEditorFrame } from '@/components/editor-frame'
import { useSplitMergeStay } from '@/components/split-merge-stay'
import {
  december,
  HardRule,
  ScheduleId,
  StayEditOutcome,
} from '@/trip/domain/domain'
import type { ScheduleStayDetail } from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnlyUnderAnyOperation,
  deferred,
  losingFirstAnswer,
  notSavedProblem,
  openEditor,
  scheduleId,
  scheduleStay,
  startSaving,
  staysEdited,
} from '@/trip/client/editor-testing'
import { mergeStays, splitStay } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  splitStay: vi.fn(),
  mergeStays: vi.fn(),
}))

const stayGone = StayEditOutcome.cases.StayNotFound.make({
  stayId: 'stay-kyoto',
})

const inDifferentBases = StayEditOutcome.cases.HardRuleBroken.make({
  rule: HardRule.cases.StaysInDifferentBases.make({}),
})

const kyoto = scheduleStay('stay-kyoto', 'kyoto', 9, 12)

/** The Kyoto Stay with one night, December 11 to 12, so it can't be split. */
const oneNightKyoto = scheduleStay('stay-kyoto', 'kyoto', 11, 12)

interface Shown {
  readonly stay: ScheduleStayDetail
  readonly next: ScheduleStayDetail | undefined
  /** The Schedule shown, when not the usual one. */
  readonly scheduleShown?: ScheduleId
}

/**
 * Split and merge of `stay`, the Kyoto Stay, while the Stay after it is
 * `next`, and its frame. Show it again to refresh the Schedule shown.
 */
const openSplitMerge = (shown: Shown, read?: () => Promise<string>) =>
  openEditor(
    ({ stay, next, scheduleShown = scheduleId }: Shown) => {
      const field = useSplitMergeStay({
        scheduleId: scheduleShown,
        stay,
        next,
        anchorWarnings: [],
      })

      return { field, frame: useEditorFrame(field, { verb: field.verb }) }
    },
    shown,
    read,
  )

describe('splitting a Stay', () => {
  it('is split once it sends the date chosen to the Stay of the Schedule shown', async () => {
    const editor = await openSplitMerge({ stay: kyoto, next: undefined })

    await act(async () =>
      editor.field().field.change({ kind: 'split', date: december(10) }),
    )
    vi.mocked(splitStay).mockImplementation(
      answeringOnlyUnderAnyOperation(
        {
          scheduleId,
          stayId: 'stay-kyoto',
          date: december(10),
        },
        staysEdited(),
        stayGone,
      ),
    )
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    assert.strictEqual(editor.field().field.verb.done, 'Split')
    await editor.close()
  })

  it('shows an open split as withdrawn once the Stay has only one night, offering Cancel', async () => {
    const editor = await openSplitMerge({ stay: kyoto, next: undefined })
    await act(async () =>
      editor.field().field.change({ kind: 'split', date: december(10) }),
    )

    await editor.show({
      stay: scheduleStay('stay-kyoto', 'kyoto', 9, 10),
      next: undefined,
    })

    const { view, discardLabel } = editor.field().frame
    assert.deepStrictEqual(
      { view, discardLabel },
      { view: 'withdrawn', discardLabel: 'Cancel' },
    )
    assert.strictEqual(
      editor.field().field.withdrawnReason,
      'This Stay has only one night now, so it can’t be split.',
    )
    await editor.close()
  })
})

describe('merging a Stay with the next', () => {
  const kyotoAgain = scheduleStay('stay-kyoto-2', 'kyoto', 12, 14)

  const osaka = scheduleStay('stay-kyoto-2', 'osaka', 12, 14)

  const refusal =
    'Only Stays in the same Base can be merged. Nothing changed. Your Stays may have changed on another device.'

  it('is merged once it sends both Stays of the Schedule shown', async () => {
    const editor = await openSplitMerge({ stay: kyoto, next: kyotoAgain })

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    vi.mocked(mergeStays).mockImplementation(
      answeringOnlyUnderAnyOperation(
        {
          scheduleId,
          stayIds: ['stay-kyoto', 'stay-kyoto-2'],
        },
        staysEdited(),
        stayGone,
      ),
    )
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    assert.strictEqual(editor.field().field.verb.done, 'Merged')
    await editor.close()
  })

  it('merges once when Retry follows a merge whose answer was lost', async () => {
    vi.mocked(mergeStays).mockImplementation(
      losingFirstAnswer(
        (retry, first) => retry.operationId === first.operationId,
        staysEdited(),
        // Stands for any answer but merged: it would merge twice.
        stayGone,
      ),
    )
    const editor = await openSplitMerge({ stay: kyoto, next: kyotoAgain })

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    await act(() => editor.field().field.save())
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('sends a merge kept across a Schedule change to the Schedule shown as a new operation', async () => {
    const replacement = ScheduleId.make('00000000-0000-4000-8000-00000000000b')
    vi.mocked(mergeStays).mockImplementation(
      losingFirstAnswer(
        (retry, first) =>
          retry.operationId !== first.operationId &&
          retry.scheduleId === replacement,
        staysEdited(),
        stayGone,
      ),
    )
    const editor = await openSplitMerge({ stay: kyoto, next: kyotoAgain })

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    await act(() => editor.field().field.save())
    await editor.show({
      stay: kyoto,
      next: kyotoAgain,
      scheduleShown: replacement,
    })
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('offers no other split or merge until the refreshed Schedule shows the merge', async () => {
    vi.mocked(mergeStays).mockResolvedValue(staysEdited())
    const reread = deferred<string>()
    let reads = 0

    const editor = await openSplitMerge(
      { stay: kyoto, next: kyotoAgain },
      () => (reads++ === 0 ? Promise.resolve('schedules') : reread.promise),
    )

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    const { finished } = await startSaving(() => editor.field().field.save())

    assert.isFalse(editor.field().field.canChoose)
    await act(async () =>
      editor.field().field.change({ kind: 'split', date: december(10) }),
    )
    assert.isTrue(SaveState.$is('Saved')(editor.field().field.state))

    await act(async () => {
      reread.resolve('schedules, re-read')
      await finished
    })
    assert.isTrue(editor.field().field.canChoose)
    await editor.close()
  })

  it('is not offered while the next Stay is in another Base', async () => {
    const editor = await openSplitMerge({ stay: kyoto, next: osaka })

    assert.isUndefined(editor.field().field.mergeable)
    await editor.close()
  })

  it('shows an open merge as withdrawn once the next Stay moves to another Base, offering Cancel', async () => {
    const editor = await openSplitMerge({ stay: kyoto, next: kyotoAgain })
    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )

    await editor.show({ stay: kyoto, next: osaka })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { shown: editor.field().field.shown, view, discardLabel, problem },
      {
        shown: true,
        view: 'withdrawn',
        discardLabel: 'Cancel',
        problem: undefined,
      },
    )
    assert.strictEqual(
      editor.field().field.withdrawnReason,
      'This Stay can no longer merge with the next one.',
    )
    await editor.close()
  })

  it('keeps a merge the Hard rules refused shown as withdrawn until discarded, and sends nothing on retry', async () => {
    // A retry that reached the Trip would be merged.
    vi.mocked(mergeStays)
      .mockResolvedValueOnce(inDifferentBases)
      .mockResolvedValue(staysEdited())

    const editor = await openSplitMerge({
      stay: oneNightKyoto,
      next: kyotoAgain,
    })

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    await act(() => editor.field().field.save())
    assert.strictEqual(notSavedProblem(editor.field().field.state), refusal)

    await editor.show({ stay: oneNightKyoto, next: osaka })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { shown: editor.field().field.shown, view, discardLabel, problem },
      {
        shown: true,
        view: 'withdrawn',
        discardLabel: 'Discard',
        problem: refusal,
      },
    )

    await act(() => editor.field().field.save())
    assert.strictEqual(notSavedProblem(editor.field().field.state), refusal)

    await act(async () => editor.field().field.discard())
    assert.isFalse(editor.field().field.shown)
    await editor.close()
  })

  it('withdraws a merge with a next Stay the Schedule no longer has, and offers the merge with the new one', async () => {
    // A merge that reached the Trip would be saved.
    vi.mocked(mergeStays).mockResolvedValue(staysEdited())

    const editor = await openSplitMerge({
      stay: oneNightKyoto,
      next: kyotoAgain,
    })

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )

    const newKyoto = scheduleStay('stay-kyoto-3', 'kyoto', 12, 14)
    await editor.show({ stay: oneNightKyoto, next: newKyoto })
    assert.isTrue(editor.field().field.withdrawn)
    await act(() => editor.field().field.save())
    assert.isTrue(SaveState.$is('Editing')(editor.field().field.state))

    await act(async () => editor.field().field.discard())
    assert.isFalse(editor.field().field.withdrawn)
    assert.strictEqual(editor.field().field.mergeable?.id, 'stay-kyoto-3')
    await editor.close()
  })

  it('shows the refusal of a merge the Schedule withdrew while it was on its way', async () => {
    const answer = deferred<StayEditOutcome>()
    vi.mocked(mergeStays).mockImplementation(() => answer.promise)

    const editor = await openSplitMerge({
      stay: oneNightKyoto,
      next: kyotoAgain,
    })

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    const { finished } = await startSaving(() => editor.field().field.save())

    await editor.show({ stay: oneNightKyoto, next: osaka })
    await act(async () => {
      answer.resolve(inDifferentBases)
      await finished
    })

    const { view, problem } = editor.field().frame
    assert.deepStrictEqual(
      { shown: editor.field().field.shown, view, problem },
      { shown: true, view: 'withdrawn', problem: refusal },
    )
    await editor.close()
  })
})
