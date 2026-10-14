// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { SaveAnswer, SaveState, useSave } from '@/trip/drafts'
import { schedulesQuery } from '@/trip/queries'

// The server functions are the transport the Trip queries read through; the
// editor here sends with its own `run` and reads with its own `queryFn`.
vi.mock('@/trip/trip.functions', () => ({}))

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const deferred = <A>() => {
  let resolve: (value: A) => void = () => undefined

  const promise = new Promise<A>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}

/**
 * The Trip note's editor, open on a page that shows the Schedules it saves
 * into, which are read with `read`.
 */
const openTripNoteEditor = async (
  run: (value: string) => Promise<SaveAnswer>,
  read: () => Promise<string>,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  let rendered: ReturnType<typeof useSave<string>> | undefined

  const Page = () => {
    useQuery({ queryKey: schedulesQuery.queryKey, queryFn: read })
    rendered = useSave({
      scheduleId: null,
      saved: 'Pack light.',
      write: 'tripNote',
      run,
    })

    return null
  }

  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Page),
      ),
    ),
  )

  const field = () => {
    if (rendered === undefined) throw new Error('The editor never rendered')

    return rendered
  }

  return {
    field,
    /** Types `note` and presses Save, before its answer comes. */
    startSave: async (note: string) => {
      await act(async () => field().change(note))
      let finished: Promise<void> = Promise.resolve()
      await act(async () => {
        finished = field().save()
      })

      return { finished }
    },
    // The leak in #83 is a listener left on the query cache itself.
    listening: () => queryClient.getQueryCache().hasListeners(),
    schedulesRefreshDue: () =>
      queryClient.getQueryState(schedulesQuery.queryKey)?.isInvalidated,
    close: () => act(async () => root.unmount()),
  }
}

describe('saving the Trip note', () => {
  it('leaves nothing listening for reads when the save lands after its editor closed', async () => {
    const answer = deferred<SaveAnswer>()

    const editor = await openTripNoteEditor(
      () => answer.promise,
      async () => 'schedules',
    )

    const saving = await editor.startSave('Pack lighter.')
    await editor.close()

    await act(async () => {
      answer.resolve(SaveAnswer.Saved())
      await saving.finished
    })

    assert.isFalse(editor.listening())
    assert.isTrue(editor.schedulesRefreshDue())
  })

  it('shows Saved, then Clean once a read confirms it, while its editor stays open', async () => {
    const reread = deferred<string>()
    let reads = 0

    const editor = await openTripNoteEditor(
      async () => SaveAnswer.Saved(),
      () => (reads++ === 0 ? Promise.resolve('schedules') : reread.promise),
    )

    const saving = await editor.startSave('Pack lighter.')
    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Saved({ value: 'Pack lighter.' }),
    )

    await act(async () => {
      reread.resolve('schedules, re-read')
      await saving.finished
    })

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    assert.isFalse(editor.listening())
    await editor.close()
  })

  it('stops waiting for the read when its editor closes after the save landed', async () => {
    const reread = deferred<string>()
    let reads = 0

    const editor = await openTripNoteEditor(
      async () => SaveAnswer.Saved(),
      () => (reads++ === 0 ? Promise.resolve('schedules') : reread.promise),
    )

    const saving = await editor.startSave('Pack lighter.')
    assert.isTrue(editor.listening())
    await editor.close()
    assert.isFalse(editor.listening())

    await act(async () => {
      reread.resolve('schedules, re-read')
      await saving.finished
    })
  })
})
