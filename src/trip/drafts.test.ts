// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { Predicate } from 'effect'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { IsoDate, ScheduleId } from '@/trip/domain'
import {
  SaveAnswer,
  SaveState,
  newActivityTarget,
  useOperationSave,
  useSave,
} from '@/trip/drafts'
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
 * A page showing the Schedules, read with `read`, and an editor on it whose
 * field is `useField(props)`. Opening it again after closing it is a reload:
 * drafts kept on the device are all that carries over.
 */
const openEditor = async <P extends object, F>(
  useField: (props: P) => F,
  props: P,
  read: () => Promise<string> = async () => 'schedules',
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  let rendered: F | undefined

  const Page = (pageProps: P) => {
    useQuery({ queryKey: schedulesQuery.queryKey, queryFn: read })
    rendered = useField(pageProps)

    return null
  }

  const root = createRoot(document.createElement('div'))

  const show = (shown: P) =>
    act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(Page, shown),
        ),
      ),
    )

  await show(props)

  return {
    field: () => {
      if (rendered === undefined) throw new Error('The editor never rendered')

      return rendered
    },
    show,
    // The leak in #83 is a listener left on the query cache itself.
    listening: () => queryClient.getQueryCache().hasListeners(),
    schedulesRefreshDue: () =>
      queryClient.getQueryState(schedulesQuery.queryKey)?.isInvalidated,
    close: () => act(async () => root.unmount()),
  }
}

/**
 * The Trip note's editor, open on a page that shows the Schedules it saves
 * into, which are read with `read`.
 */
const openTripNoteEditor = async (
  run: (value: string) => Promise<SaveAnswer>,
  read: () => Promise<string>,
) => {
  const editor = await openEditor(
    () =>
      useSave({
        scheduleId: null,
        saved: 'Pack light.',
        write: 'tripNote',
        run,
      }),
    {},
    read,
  )

  return {
    ...editor,
    /** Types `note` and presses Save, before its answer comes. */
    startSave: async (note: string) => {
      await act(async () => editor.field().change(note))
      let finished: Promise<void> = Promise.resolve()
      await act(async () => {
        finished = editor.field().save()
      })

      return { finished }
    },
  }
}

interface NewActivity {
  readonly title: string
  readonly operationId: string
  readonly operationScheduleId: string
}

interface AddSent {
  readonly operationId: string
  readonly scheduleId: ScheduleId
}

/**
 * The New Activity editor on a Day, open on a page showing `scheduleId`.
 * Each add it sends is recorded in `sent`, to the Schedule shown then.
 */
const openNewActivityEditor = async (
  scheduleId: ScheduleId,
  sent: Array<AddSent>,
) => {
  const editor = await openEditor(
    ({ scheduleId }: { scheduleId: ScheduleId }) =>
      useOperationSave<NewActivity>({
        draft: {
          target: newActivityTarget(IsoDate.make('2026-12-07')),
          isValue: (value): value is NewActivity =>
            Predicate.isObject(value) &&
            Predicate.isString(value.title) &&
            Predicate.isString(value.operationId) &&
            Predicate.isString(value.operationScheduleId),
        },
        equals: (a, b) => a.title === b.title,
        scheduleId,
        saved: { title: '', operationId: '', operationScheduleId: '' },
        write: 'activity',
        run: async ({ operationId }) => {
          sent.push({ operationId, scheduleId })

          return SaveAnswer.Saved()
        },
      }),
    { scheduleId },
  )

  return {
    ...editor,
    /** The page now shows another Schedule, as after choosing again. */
    showSchedule: (next: ScheduleId) => editor.show({ scheduleId: next }),
  }
}

/** Why a NotSaved value isn't saved; nothing for any other state. */
const notSavedProblem = <V>(state: SaveState<V>) =>
  SaveState.$is('NotSaved')(state) ? state.problem : undefined

const scheduleChanged =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

describe('adding an Activity', () => {
  const scheduleA = ScheduleId.make('00000000-0000-4000-8000-00000000000a')
  const scheduleB = ScheduleId.make('00000000-0000-4000-8000-00000000000b')

  it('keeps a Draft typed for a replaced Schedule marked "Schedule changed" across a reload, and adds it once to the Schedule shown', async () => {
    localStorage.clear()
    const sent: Array<AddSent> = []

    const before = await openNewActivityEditor(scheduleA, sent)
    await act(async () =>
      before.field().change({ ...before.field().value, title: 'Tsukiji' }),
    )
    const firstOperation = before.field().value.operationId

    await before.showSchedule(scheduleB)
    assert.strictEqual(notSavedProblem(before.field().state), scheduleChanged)
    await before.close()

    const after = await openNewActivityEditor(scheduleB, sent)
    assert.strictEqual(notSavedProblem(after.field().state), scheduleChanged)
    assert.strictEqual(after.field().value.title, 'Tsukiji')

    await act(() => after.field().save())
    assert.strictEqual(sent.length, 1)
    assert.strictEqual(sent[0]?.scheduleId, scheduleB)
    assert.notStrictEqual(sent[0]?.operationId, firstOperation)
    await after.close()
  })
})

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
