import { useQueryClient } from '@tanstack/react-query'
import { Data } from 'effect'
import { useEffect, useRef, useState } from 'react'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import { toast } from '@/components/ui/toast'
import type { ScheduleId } from '@/trip/domain/domain'
import { answerOf, SaveAnswer } from '@/trip/client/drafts.answers'
import type { SaveReply } from '@/trip/client/drafts.answers'
import { clearDraft, readDraft, writeDraft } from '@/trip/client/drafts.targets'
import type { Draft } from '@/trip/client/drafts.targets'
import { operationFor } from '@/trip/client/operations'
import type { Operation } from '@/trip/client/operations'
import {
  invalidateAfter,
  invalidateAfterScheduleChanged,
  subscribeToReadsAfter,
} from '@/trip/client/queries'
import type { TripWrite } from '@/trip/client/queries'

/**
 * A value saved under the save pattern, by what it shows.
 *
 * - Clean: the saved value, unedited; just saved once a save brought it.
 * - Editing: Phillip's unsaved value, never sent.
 * - Saving: the value on its way. It can't change until the answer comes, so
 *   two saves never race.
 * - NotSaved: a value whose save failed or was refused, or a draft restored
 *   from an earlier visit, with why. It stays marked while edited.
 * - Saved: the value just saved, until what it affects is next read.
 */
export type SaveState<V> = Data.TaggedEnum<{
  Clean: { readonly justSaved: boolean }
  Editing: { readonly value: V }
  Saving: { readonly value: V }
  NotSaved: { readonly value: V; readonly problem: string }
  Saved: { readonly value: V }
}>

interface SaveStateDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: SaveState<this['A']>
}

export const SaveState = Data.taggedEnum<SaveStateDefinition>()

const clean = SaveState.Clean({ justSaved: false })

const restoredProblem =
  'This is what you typed here last time. Save it, or discard it.'

const scheduleChangedProblem = (drafted: boolean) =>
  drafted
    ? 'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'
    : 'Your Schedule changed on another device. This page now shows it as it is.'

const unansweredProblem = (drafted: boolean) => {
  const loginExpired = ConnectionStatus.$is('LoginExpired')(currentConnection())

  if (drafted) {
    return loginExpired
      ? 'Your login expired. Your text is kept here; log in again, then retry.'
      : 'The app couldn’t reach the server. Your text is kept here; retry when you’re back online.'
  }

  return loginExpired
    ? 'Your login expired. Log in again, then retry.'
    : 'The app couldn’t reach the server. Retry when you’re back online.'
}

const useOnChange = <A>(
  value: A,
  onChange: (value: A) => void,
  same: (a: A, b: A) => boolean = Object.is,
) => {
  const last = useRef(value)
  useEffect(() => {
    if (same(last.current, value)) return
    last.current = value
    onChange(value)
  }, [value])
}

/** What every save sets, whether or not it has a saved value. */
interface SaveOptions<V, S> {
  /**
   * What it saves, such as `dayNoteTarget(date)`. The hook starts afresh when
   * this changes, so its editor needs no key.
   */
  readonly target: string
  /**
   * Keeps the value as a Draft under its target, saying whether a value read
   * back from the device is one.
   */
  readonly draft?: (value: unknown) => value is V
  readonly equals?: (a: V, b: V) => boolean
  /**
   * The Schedule the value was read from, or null for a value tied to none,
   * such as the Trip note, which a Schedule change never affects.
   */
  readonly scheduleId: ScheduleId | null
  /**
   * Whether the Schedule shown still offers a value, such as a merge with
   * the next Stay once another device moves it to another Base. An open edit
   * it withdraws stays shown, with any refusal, until Phillip discards it;
   * saving it sends nothing.
   */
  readonly offered?: (value: S) => boolean
  readonly write: TripWrite
  /**
   * Sends the value, answering the outcomes only this editor has, as
   * `answerOwn` does; throws when the request gets no answer.
   *
   * Each send goes under an operation id, for writes the Trip replays by it.
   * A retry of the same value to the same Schedule, even after a reload,
   * keeps it, so it writes once. An edited value, or one kept across a
   * Schedule change, gets a new one for the Schedule now shown.
   */
  readonly run: (value: V, operationId: string) => Promise<SaveReply>
}

/** A field saved under the save pattern, shown as `S`. */
export interface SaveField<V, S = V> {
  readonly state: SaveState<V>
  /** The value shown: the saved one while Clean. */
  readonly value: S
  /** Whether the Schedule offers the value, or an edit of it is open. */
  readonly shown: boolean
  /** An open edit the Schedule shown no longer offers. */
  readonly withdrawn: boolean
  readonly edit: () => void
  readonly change: (next: V) => void
  readonly discard: () => void
  /** Sends the value being edited or not saved, unless withdrawn. */
  readonly save: () => Promise<void>
  /** Sends `next` at once, such as a Pin removed. */
  readonly send: (next: V) => Promise<void>
}

/**
 * A value saved as a whole under the save pattern. Before each save a value
 * kept as a Draft is written as one; only a successful save clears it, and
 * invalidates the queries the write affects. A Draft left by an earlier
 * visit or a login reload is restored marked not saved, and is sent only by
 * Save or Retry. A "Schedule changed" refusal refetches the data and keeps
 * the value, and so does an answer that what it was for is gone. Every other
 * refusal keeps the value without refetching.
 *
 * Without `saved`, nothing is saved to show while Clean, as for a split or
 * merge chosen afresh each time.
 */
export function useSave<V>(
  options: SaveOptions<V, V> & { readonly saved: V },
): SaveField<V>
export function useSave<V>(
  options: SaveOptions<V, V | undefined>,
): SaveField<V, V | undefined>
export function useSave<V>({
  target,
  draft: isDraft,
  equals = (a, b) => a === b,
  scheduleId,
  saved,
  offered = () => true,
  write,
  run,
}: SaveOptions<V, V | undefined> & {
  readonly saved?: V
}): SaveField<V, V | undefined> {
  const queryClient = useQueryClient()

  const [held, setHeld] = useState<{
    readonly target: string
    readonly state: SaveState<V>
  }>({ target, state: clean })

  // Another target starts afresh, even if its earlier state is still held.
  if (held.target !== target) setHeld({ target, state: clean })

  const state = held.target === target ? held.state : clean
  const targetRef = useRef(target)
  targetRef.current = target
  const savedRef = useRef(saved)
  savedRef.current = saved
  const scheduleIdRef = useRef(scheduleId)
  scheduleIdRef.current = scheduleId
  const drafted = isDraft !== undefined
  const ownDraftWriteId = useRef<string>(undefined)
  const operation = useRef<Operation>(undefined)

  /**
   * Updates the state of this render's target, unless the target changed
   * since.
   */
  const updateState = (update: (current: SaveState<V>) => SaveState<V>) => {
    if (targetRef.current !== target) return

    setHeld((current) => ({
      target,
      state: update(current.target === target ? current.state : clean),
    }))
  }

  const setState = (next: SaveState<V>) => updateState(() => next)

  const isSaved = (value: V) =>
    savedRef.current !== undefined && equals(value, savedRef.current)

  const storedDraft = () => (isDraft ? readDraft(target, isDraft) : undefined)

  const keepDraft = (
    next: V,
    typedFor: string | null,
    operationId: string | undefined,
  ) => {
    ownDraftWriteId.current = isDraft
      ? writeDraft(target, next, typedFor, operationId)
      : undefined

    return ownDraftWriteId.current
  }

  const clearStoredDraft = () => {
    if (isDraft) clearDraft(target)
  }

  const clearDraftIfStill = (writeId: string | undefined) => {
    if (writeId !== undefined && storedDraft()?.writeId === writeId) {
      clearStoredDraft()
    }
  }

  const clearOwnDraft = () => clearDraftIfStill(ownDraftWriteId.current)

  const typedForAnotherSchedule = (draft: Draft<V>) =>
    draft.scheduleId !== scheduleIdRef.current

  const savedAlready = (draft: Draft<V>) =>
    !typedForAnotherSchedule(draft) && isSaved(draft.value)

  const markedForChangedSchedule = (current: SaveState<V>) =>
    (SaveState.$is('Editing')(current) || SaveState.$is('NotSaved')(current)) &&
    !isSaved(current.value)
      ? SaveState.NotSaved({
          value: current.value,
          problem: scheduleChangedProblem(drafted),
        })
      : current

  const savedAfterAll = (latest: V) => (current: SaveState<V>) =>
    SaveState.$is('NotSaved')(current) && equals(current.value, latest)
      ? clean
      : current

  const stopAwaitingRead = useRef<() => void>(undefined)
  const editorOpen = useRef(false)
  useEffect(() => {
    editorOpen.current = true

    return () => {
      editorOpen.current = false
      stopAwaitingRead.current?.()
    }
  }, [])

  const cleanOnNextRead = () => {
    // A save answered after its editor closed, or moved to another target,
    // has no field left to mark.
    if (!editorOpen.current || targetRef.current !== target) return

    stopAwaitingRead.current?.()

    const stop = subscribeToReadsAfter(queryClient, write, () => {
      stop()
      updateState((current) =>
        SaveState.$is('Saved')(current)
          ? SaveState.Clean({ justSaved: true })
          : current,
      )
    })

    stopAwaitingRead.current = stop
  }

  useEffect(() => {
    stopAwaitingRead.current?.()
    stopAwaitingRead.current = undefined
    ownDraftWriteId.current = undefined
    operation.current = undefined

    const draft = storedDraft()

    if (draft === undefined) return

    if (savedAlready(draft)) clearStoredDraft()
    else {
      ownDraftWriteId.current = draft.writeId
      operation.current =
        draft.operationId === undefined
          ? undefined
          : { id: draft.operationId, for: draft.scheduleId }
      setState(
        SaveState.NotSaved({
          value: draft.value,
          problem: typedForAnotherSchedule(draft)
            ? scheduleChangedProblem(true)
            : restoredProblem,
        }),
      )
    }
  }, [target])

  useOnChange(scheduleId, () => updateState(markedForChangedSchedule))

  useOnChange(
    saved,
    (latest) => {
      if (latest === undefined) return

      const draft = storedDraft()

      const own =
        draft !== undefined && draft.writeId === ownDraftWriteId.current

      if (own && typedForAnotherSchedule(draft)) return

      if (own && savedAlready(draft)) clearStoredDraft()
      updateState(savedAfterAll(latest))
    },
    (a, b) => (a === undefined || b === undefined ? a === b : equals(a, b)),
  )

  const value = SaveState.$is('Clean')(state) ? saved : state.value

  const open =
    SaveState.$is('Editing')(state) || SaveState.$is('NotSaved')(state)

  const stillOffered = offered(value)
  const withdrawn = open && !stillOffered

  const edit = () => {
    if (value === undefined) return

    operation.current = undefined
    setState(SaveState.Editing({ value }))
  }

  const change = (next: V) => {
    if (SaveState.$is('Saving')(state)) return

    operation.current = undefined

    if (isSaved(next)) clearOwnDraft()
    else keepDraft(next, scheduleIdRef.current, undefined)
    setState(
      SaveState.$is('NotSaved')(state)
        ? { ...state, value: next }
        : SaveState.Editing({ value: next }),
    )
  }

  const discard = () => {
    operation.current = undefined
    clearOwnDraft()
    setState(clean)
  }

  const saveValue = async (sending: V) => {
    const sentTo = scheduleIdRef.current
    const sentUnder = operationFor(operation.current, sentTo)
    operation.current = sentUnder
    const sentDraftWriteId = keepDraft(sending, sentTo, sentUnder.id)
    setState(SaveState.Saving({ value: sending }))
    let reply: SaveReply

    let mayHaveLanded = false

    try {
      reply = await run(sending, sentUnder.id)
    } catch {
      mayHaveLanded = true
      reply = SaveAnswer.Refused({ problem: unansweredProblem(drafted) })
    }

    const answered = answerOf(reply)

    if (answered.warning !== undefined) {
      toast.add({ type: 'warning', ...answered.warning })
    }

    const answer =
      scheduleIdRef.current === sentTo
        ? answered.answer
        : SaveAnswer.ScheduleChanged()

    if (SaveAnswer.$is('Saved')(answer)) {
      clearDraftIfStill(sentDraftWriteId)

      if (targetRef.current === target) operation.current = undefined
      cleanOnNextRead()
      setState(SaveState.Saved({ value: sending }))
      await invalidateAfter(queryClient, write)

      return
    }

    setState(
      SaveState.NotSaved({
        value: sending,
        problem: SaveAnswer.$is('ScheduleChanged')(answer)
          ? scheduleChangedProblem(drafted)
          : answer.problem,
      }),
    )

    if (SaveAnswer.$is('ScheduleChanged')(answer)) {
      await invalidateAfterScheduleChanged(queryClient)
    } else if (SaveAnswer.$is('Gone')(answer) || mayHaveLanded) {
      await invalidateAfter(queryClient, write)
    }
  }

  const save = async () => {
    if (withdrawn) return

    if (SaveState.$is('Editing')(state) || SaveState.$is('NotSaved')(state)) {
      await saveValue(state.value)
    }
  }

  const send = async (next: V) => {
    if (SaveState.$is('Saving')(state)) return

    operation.current = undefined
    await saveValue(next)
  }

  return {
    state,
    value,
    shown: stillOffered || open,
    withdrawn,
    edit,
    change,
    discard,
    save,
    send,
  }
}

/**
 * A one-shot send, such as a Tick or moving an Activity: no saved value
 * stands for it, so `sending` is what is on its way, saved but not yet
 * shown, or not saved. Retry it with `save`.
 */
export const useSend = <V>({
  moot = () => false,
  ...options
}: Pick<
  SaveOptions<V, V | undefined>,
  'target' | 'scheduleId' | 'write' | 'run'
> & {
  /**
   * Whether the page now shows a send not saved needs no retry, such as a
   * Tick the Checklist shows ticked after all, or a move of an Activity
   * since removed. Such a send is dropped.
   */
  readonly moot?: (value: V) => boolean
}) => {
  const { state, value, save, send, discard } = useSave<V>(options)
  const settled = SaveState.$is('NotSaved')(state) && moot(state.value)

  useEffect(() => {
    if (settled) discard()
  }, [settled])

  return { state, sending: value, save, send, discard }
}
