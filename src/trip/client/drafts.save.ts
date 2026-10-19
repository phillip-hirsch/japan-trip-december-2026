import { useQueryClient } from '@tanstack/react-query'
import { Data, Predicate } from 'effect'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import { toast } from '@/components/ui/toast'
import type { ScheduleId } from '@/trip/domain/domain'
import { answerOf, SaveAnswer } from '@/trip/client/drafts.answers'
import type { SaveReply } from '@/trip/client/drafts.answers'
import { operationFor } from '@/trip/client/operations'
import type { Operation } from '@/trip/client/operations'
import {
  invalidateAfter,
  invalidateAfterScheduleChanged,
  subscribeToReadsAfter,
} from '@/trip/client/queries'
import type { TripWrite } from '@/trip/client/queries'

interface Draft<V> {
  readonly value: V
  /** The Schedule shown when it was typed, kept until it is edited. */
  readonly scheduleId: string | null
  readonly writeId: string
  /** The operation it was last sent under, kept for its retry. */
  readonly operation: Operation | undefined
}

const storageKey = (target: string) => `draft:${target}`

const isOperation = (value: unknown): value is Operation =>
  Predicate.isObject(value) &&
  Predicate.isString(value.id) &&
  (Predicate.isString(value.subject) || Predicate.isNull(value.subject))

// Storage can be unavailable or full; the field still holds the value then.
const readDraft = <V>(
  target: string,
  isValue: (value: unknown) => value is V,
): Draft<V> | undefined => {
  try {
    const stored = localStorage.getItem(storageKey(target))

    if (stored === null) return undefined

    const draft: unknown = JSON.parse(stored)

    if (
      !Predicate.isObject(draft) ||
      !(
        Predicate.isString(draft.scheduleId) ||
        Predicate.isNull(draft.scheduleId)
      ) ||
      !Predicate.isString(draft.id)
    ) {
      return undefined
    }

    // Drafts written before #99 keep their operation inside the value, as
    // operationId and operationScheduleId. Move it out. A retry of a send
    // that landed then reuses its id and adds nothing, and a later edit
    // can't bring the old id back.
    let value = draft.value
    let operation = isOperation(draft.operation) ? draft.operation : undefined

    if (Predicate.isObject(value) && Predicate.isString(value.operationId)) {
      const { operationId: id, operationScheduleId, ...rest } = value
      value = rest

      const subject =
        Predicate.isString(operationScheduleId) && operationScheduleId !== ''
          ? operationScheduleId
          : draft.scheduleId

      if (operation === undefined && id !== '') operation = { id, subject }
    }

    return isValue(value)
      ? { value, scheduleId: draft.scheduleId, writeId: draft.id, operation }
      : undefined
  } catch {
    return undefined
  }
}

const writeDraft = <V>(
  target: string,
  { value, scheduleId, operation }: Omit<Draft<V>, 'writeId'>,
) => {
  const writeId = crypto.randomUUID()

  try {
    localStorage.setItem(
      storageKey(target),
      JSON.stringify({ value, scheduleId, id: writeId, operation }),
    )
  } catch {
    // Nothing else can keep it; the field still holds it.
  }

  return writeId
}

const clearDraft = (target: string) => {
  try {
    localStorage.removeItem(storageKey(target))
  } catch {
    // A draft left behind is restored and compared with the saved value.
  }
}

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

/** Whether Phillip is editing the value, or it is not saved. */
const isOpen = <V>(
  state: SaveState<V>,
): state is Extract<SaveState<V>, { readonly _tag: 'Editing' | 'NotSaved' }> =>
  SaveState.$is('Editing')(state) || SaveState.$is('NotSaved')(state)

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
   * What it saves, such as `dayNoteTarget(date)`. The hook resets to Clean
   * when this changes, so its editor needs no key.
   */
  readonly target: string
  /**
   * Keeps the value as a Draft under its target. It checks that a value
   * read back from the device is one.
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
   * Each value comes with an operation id. Writes the Trip replays by
   * operation id send it, and others ignore it. A retry of the same value to
   * the same Schedule keeps the id, even after a reload, so it writes once.
   * An edited value, or one kept across a Schedule change, gets a new id.
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
 * Without `saved`, the value is undefined while Clean. Split and merge work
 * this way, since no choice of theirs is ever saved.
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

  // A new target resets the state to Clean.
  if (held.target !== target) setHeld({ target, state: clean })

  const state = held.target === target ? held.state : clean
  // Handlers and answers read the props of the last render React committed.
  const savedRef = useRef(saved)
  const scheduleIdRef = useRef(scheduleId)
  useLayoutEffect(() => {
    savedRef.current = saved
    scheduleIdRef.current = scheduleId
  })
  const drafted = isDraft !== undefined
  const ownDraftWriteId = useRef<string>(undefined)
  const operation = useRef<Operation>(undefined)
  // Counts visits to a target, so the answer to a save from an earlier
  // visit never changes the state of a later one.
  const visit = useRef(0)

  /**
   * Updates the state of this render's target, unless the hook has moved to
   * another target since.
   */
  const updateState = (update: (current: SaveState<V>) => SaveState<V>) =>
    setHeld((current) =>
      current.target === target
        ? { target, state: update(current.state) }
        : current,
    )

  const setState = (next: SaveState<V>) => updateState(() => next)

  const isSaved = (value: V) =>
    savedRef.current !== undefined && equals(value, savedRef.current)

  const storedDraft = () => (isDraft ? readDraft(target, isDraft) : undefined)

  const keepDraft = (draft: Omit<Draft<V>, 'writeId'>) => {
    ownDraftWriteId.current = isDraft ? writeDraft(target, draft) : undefined

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
    isOpen(current) && !isSaved(current.value)
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
    // A save answered after its editor closed has no field left to mark.
    if (!editorOpen.current) return

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
    visit.current += 1
    stopAwaitingRead.current?.()
    stopAwaitingRead.current = undefined
    ownDraftWriteId.current = undefined
    operation.current = undefined

    const draft = storedDraft()

    if (draft === undefined) return

    if (savedAlready(draft)) clearStoredDraft()
    else {
      ownDraftWriteId.current = draft.writeId
      operation.current = draft.operation
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

  const open = isOpen(state)

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
    else {
      keepDraft({
        value: next,
        scheduleId: scheduleIdRef.current,
        operation: undefined,
      })
    }

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
    const sentOnVisit = visit.current
    const sentTo = scheduleIdRef.current
    const sentUnder = operationFor(operation.current, sentTo)
    operation.current = sentUnder
    const ownDraft = storedDraft()

    // A Draft typed for another Schedule stays marked for it until edited.
    const typedFor =
      ownDraft !== undefined && ownDraft.writeId === ownDraftWriteId.current
        ? ownDraft.scheduleId
        : sentTo

    const sentDraftWriteId = keepDraft({
      value: sending,
      scheduleId: typedFor,
      operation: sentUnder,
    })

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

    const stillOnVisit = visit.current === sentOnVisit

    if (SaveAnswer.$is('Saved')(answer)) {
      clearDraftIfStill(sentDraftWriteId)

      if (stillOnVisit) {
        operation.current = undefined
        cleanOnNextRead()
        setState(SaveState.Saved({ value: sending }))
      }

      await invalidateAfter(queryClient, write)

      return
    }

    if (stillOnVisit) {
      setState(
        SaveState.NotSaved({
          value: sending,
          problem: SaveAnswer.$is('ScheduleChanged')(answer)
            ? scheduleChangedProblem(drafted)
            : answer.problem,
        }),
      )
    }

    if (SaveAnswer.$is('ScheduleChanged')(answer)) {
      await invalidateAfterScheduleChanged(queryClient)
    } else if (SaveAnswer.$is('Gone')(answer) || mayHaveLanded) {
      await invalidateAfter(queryClient, write)
    }
  }

  const save = async () => {
    if (withdrawn) return

    if (isOpen(state)) await saveValue(state.value)
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
 * A one-shot send, such as a Tick or moving an Activity. It has no saved
 * value, so `sent` holds the value on its way, saved but not yet shown, or
 * not saved. `save` retries it.
 */
export const useSend = <V>({
  moot = () => false,
  ...options
}: Pick<
  SaveOptions<V, V | undefined>,
  'target' | 'scheduleId' | 'write' | 'run'
> & {
  /**
   * Whether a send not saved needs no retry, given what the page now shows.
   * Examples are a Tick the Checklist shows ticked after all, or a move of
   * an Activity since removed. The hook drops such a send.
   */
  readonly moot?: (value: V) => boolean
}) => {
  const { state, value, save, send, discard } = useSave<V>(options)
  const mooted = SaveState.$is('NotSaved')(state) && moot(state.value)

  useEffect(() => {
    if (mooted) discard()
  }, [mooted])

  return { state, sent: value, save, send, discard }
}
