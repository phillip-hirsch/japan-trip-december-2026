// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { ScheduleId } from '@/trip/domain/domain'
import { SaveAnswer, useOfferedSave } from '@/trip/client/drafts'
import {
  deferred,
  notSavedProblem,
  openEditor,
  startSaving,
} from '@/trip/client/editor-testing'

// The server functions are the transport the Trip queries read through; the
// editor here sends with its own `run` and reads with its own `queryFn`.
vi.mock('@/trip/trip/trip.functions', () => ({}))

/**
 * The "Merge with next Stay" Stay edit on a Kyoto Stay, open on a page whose
 * Schedule offers a merge with the Stay `next`, or none. Each merge it sends
 * is recorded in `sent`, and answered with `answer`.
 */
const openMergeEditor = async (
  next: string | undefined,
  sent: Array<string>,
  answer: () => Promise<SaveAnswer>,
) => {
  const editor = await openEditor(
    ({ next }: { next: string | undefined }) =>
      useOfferedSave<string | null>({
        offered: (choice) =>
          choice === null ? next !== undefined : choice === next,
        scheduleId: ScheduleId.make('00000000-0000-4000-8000-00000000000a'),
        saved: null,
        write: 'stayEdit',
        run: async (choice) => {
          if (choice !== null) sent.push(choice)

          return answer()
        },
      }),
    { next },
  )

  return {
    ...editor,
    /** The page now shows the Schedule as another device left it. */
    refresh: (next: string | undefined) => editor.show({ next }),
  }
}

describe('a Stay edit the refreshed Schedule withdraws', () => {
  const refusal =
    'Only Stays in the same Base can be merged. Nothing changed. Your Stays may have changed on another device.'

  const refused = async () => SaveAnswer.Gone({ problem: refusal })

  it('keeps its Hard-rule refusal shown until discarded, and sends nothing on retry', async () => {
    const sent: Array<string> = []
    const editor = await openMergeEditor('stay-osaka', sent, refused)

    await act(async () => editor.field().change('stay-osaka'))
    await act(() => editor.field().save())
    assert.deepStrictEqual(sent, ['stay-osaka'])
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)

    await editor.refresh(undefined)
    assert.isTrue(editor.field().shown)
    assert.isTrue(editor.field().withdrawn)
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)

    await act(() => editor.field().save())
    assert.deepStrictEqual(sent, ['stay-osaka'])
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)

    await act(async () => editor.field().discard())
    assert.isFalse(editor.field().shown)
    await editor.close()
  })

  it('withdraws a chosen edit the Schedule no longer offers, and still offers the new one', async () => {
    const sent: Array<string> = []
    const editor = await openMergeEditor('stay-a', sent, refused)

    await act(async () => editor.field().change('stay-a'))
    await editor.refresh('stay-b')
    assert.isTrue(editor.field().withdrawn)
    await act(() => editor.field().save())
    assert.deepStrictEqual(sent, [])

    await act(async () => editor.field().discard())
    assert.isTrue(editor.field().shown)
    assert.isFalse(editor.field().withdrawn)
    await editor.close()
  })

  it('shows the refusal of a save the Schedule withdrew while it was on its way', async () => {
    const sent: Array<string> = []
    const answer = deferred<SaveAnswer>()

    const editor = await openMergeEditor(
      'stay-osaka',
      sent,
      () => answer.promise,
    )

    await act(async () => editor.field().change('stay-osaka'))
    const { finished } = await startSaving(() => editor.field().save())
    await editor.refresh(undefined)

    await act(async () => {
      answer.resolve(SaveAnswer.Gone({ problem: refusal }))
      await finished
    })

    assert.isTrue(editor.field().shown)
    assert.isTrue(editor.field().withdrawn)
    assert.strictEqual(notSavedProblem(editor.field().state), refusal)
    await editor.close()
  })
})
