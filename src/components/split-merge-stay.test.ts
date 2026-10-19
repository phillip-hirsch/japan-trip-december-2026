// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useEditorFrame } from '@/components/editor-frame'
import { useSplitMergeStay } from '@/components/split-merge-stay'
import { december, HardRule, StayEditOutcome } from '@/trip/domain/domain'
import type { ScheduleStayDetail } from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  deferred,
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

const kyoto = scheduleStay('stay-kyoto', 'kyoto', 9, 12)

/**
 * Split and merge of the Kyoto Stay, December 9 to 12, while the Stay after
 * it is `next`, and its frame.
 */
const openSplitMerge = (
  next: ScheduleStayDetail | undefined,
  read?: () => Promise<string>,
) =>
  openEditor(
    ({ next }: { next: ScheduleStayDetail | undefined }) => {
      const field = useSplitMergeStay({
        scheduleId,
        stay: kyoto,
        next,
        anchorWarnings: [],
      })

      return { field, frame: useEditorFrame(field, field.verb) }
    },
    { next },
    read,
  )

describe('splitting a Stay', () => {
  it('is split once it sends the date chosen to the Stay of the Schedule shown', async () => {
    const editor = await openSplitMerge(undefined)

    await act(async () =>
      editor.field().field.change({ kind: 'split', date: december(10) }),
    )
    const { value } = editor.field().field
    vi.mocked(splitStay).mockImplementation(
      answeringOnly(
        {
          scheduleId,
          operationId: value?.operationId,
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
    const editor = await openEditor(
      ({ stay }: { stay: ScheduleStayDetail }) => {
        const field = useSplitMergeStay({
          scheduleId,
          stay,
          next: undefined,
          anchorWarnings: [],
        })

        return { field, frame: useEditorFrame(field, field.verb) }
      },
      { stay: kyoto },
    )

    await act(async () =>
      editor.field().field.change({ kind: 'split', date: december(10) }),
    )

    await editor.show({ stay: scheduleStay('stay-kyoto', 'kyoto', 9, 10) })

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

  it('is merged once it sends both Stays of the Schedule shown', async () => {
    const editor = await openSplitMerge(kyotoAgain)

    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    const { value } = editor.field().field
    vi.mocked(mergeStays).mockImplementation(
      answeringOnly(
        {
          scheduleId,
          operationId: value?.operationId,
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

  it('offers no other split or merge until the refreshed Schedule shows the merge', async () => {
    vi.mocked(mergeStays).mockResolvedValue(staysEdited())
    const reread = deferred<string>()
    let reads = 0

    const editor = await openSplitMerge(kyotoAgain, () =>
      reads++ === 0 ? Promise.resolve('schedules') : reread.promise,
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
    const editor = await openSplitMerge(osaka)

    assert.isUndefined(editor.field().field.mergeable)
    await editor.close()
  })

  it('shows an open merge as withdrawn once the next Stay moves to another Base, offering Cancel', async () => {
    const editor = await openSplitMerge(kyotoAgain)
    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )

    await editor.show({ next: osaka })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { view, discardLabel, problem },
      { view: 'withdrawn', discardLabel: 'Cancel', problem: undefined },
    )
    assert.strictEqual(
      editor.field().field.withdrawnReason,
      'This Stay can no longer merge with the next one.',
    )
    await editor.close()
  })

  it('keeps a merge the Hard rules refused visible as withdrawn, with the refusal, offering Discard', async () => {
    vi.mocked(mergeStays).mockResolvedValue(
      StayEditOutcome.cases.HardRuleBroken.make({
        rule: HardRule.cases.StaysInDifferentBases.make({}),
      }),
    )
    const editor = await openSplitMerge(kyotoAgain)
    await act(async () =>
      editor.field().field.change({ kind: 'merge', next: kyotoAgain }),
    )
    await act(() => editor.field().field.save())

    await editor.show({ next: osaka })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { view, discardLabel, problem },
      {
        view: 'withdrawn',
        discardLabel: 'Discard',
        problem:
          'Only Stays in the same Base can be merged. Nothing changed. Your Stays may have changed on another device.',
      },
    )
    await editor.close()
  })
})
