// The save pattern every edit uses. What Phillip types is kept as a draft in
// the browser's local storage, keyed by its target (such as the Day note on
// 2026-12-14), until a save succeeds, so no failed save, login reload or
// closed app loses it. A draft is never saved behind his back: only his Save
// or Retry sends it. A one-tap value, such as a tick, keeps no draft: tapping
// again loses nothing.
import { useQueryClient } from '@tanstack/react-query'
import { Data, Predicate } from 'effect'
import { useEffect, useRef, useState } from 'react'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import type { IsoDate, ScheduleId } from '@/trip/domain'
import {
  invalidateAfter,
  invalidateAfterScheduleChanged,
  subscribeToReadsAfter,
} from '@/trip/queries'
import type { TripWrite } from '@/trip/queries'

const storageKey = (target: string) => `draft:${target}`

/**
 * A stored draft, with the Schedule it was typed for, or null for a value
 * tied to none, such as the Trip note. Each write has its own id, so a save
 * clears only the draft it wrote, never a later one with the same text.
 */
interface Draft<V> {
  readonly value: V
  readonly scheduleId: string | null
  readonly id: string
}

/**
 * Where a value's draft is kept: its target, and the check that what is
 * stored there is such a value.
 */
export interface DraftKeeping<V> {
  readonly target: string
  readonly isValue: (value: unknown) => value is V
}

// Storage can be unavailable or full; the field still holds the value then.
const readDraft = <V>({
  target,
  isValue,
}: DraftKeeping<V>): Draft<V> | undefined => {
  try {
    const stored = localStorage.getItem(storageKey(target))

    if (stored === null) return undefined

    const draft: unknown = JSON.parse(stored)

    return Predicate.isObject(draft) &&
      isValue(draft.value) &&
      (Predicate.isString(draft.scheduleId) ||
        Predicate.isNull(draft.scheduleId)) &&
      Predicate.isString(draft.id)
      ? { value: draft.value, scheduleId: draft.scheduleId, id: draft.id }
      : undefined
  } catch {
    return undefined
  }
}

/** Keeps a value as the target's draft, returning that write's id. */
const writeDraft = <V>(target: string, value: V, scheduleId: string | null) => {
  const draft: Draft<V> = { value, scheduleId, id: crypto.randomUUID() }

  try {
    localStorage.setItem(storageKey(target), JSON.stringify(draft))
  } catch {
    // Nothing else can keep it; the field still holds it.
  }

  return draft.id
}

const clearDraft = (target: string) => {
  try {
    localStorage.removeItem(storageKey(target))
  } catch {
    // A draft left behind is restored and compared with the saved value.
  }
}

/** The draft target of the Day note on a date. */
export const dayNoteTarget = (date: IsoDate) => `day-note:${date}`

/**
 * The draft target of the Stay note on a Stay, by its id. Not by its dates:
 * a Stay keeps its id when they change, and another Schedule's Stay checking
 * in on the same date may be somewhere else entirely. Its id is fresh in each
 * Schedule, so a draft refused because the Schedule changed is kept, and
 * reopens only if its own Schedule is restored.
 */
export const stayNoteTarget = (stayId: string) => `stay-note:${stayId}`

/** The draft target of the Trip note. */
export const tripNoteTarget = 'trip-note'

/** The draft target of a new own Checklist item. */
export const newChecklistItemTarget = 'checklist-item:new'

/** What a save answered, when it got an answer. */
export type SaveAnswer = Data.TaggedEnum<{
  Saved: {}
  ScheduleChanged: {}
  Refused: { readonly problem: string }
}>

export const SaveAnswer = Data.taggedEnum<SaveAnswer>()

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

/** A Schedule change refused the save; a draft says its text is kept. */
const scheduleChangedProblem = (drafted: boolean) =>
  drafted
    ? 'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'
    : 'Your Schedule changed on another device. This page now shows it as it is.'

/**
 * Why a save got no answer, from what the request showed; a draft says its
 * text is kept.
 */
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

/**
 * A value saved as a whole under the save pattern. Before each save a value
 * with a draft target is written as its draft; only a successful save clears
 * it, and invalidates the queries the write affects. On mount, a draft left
 * by an earlier visit or a login reload is restored, marked not saved. A
 * "Schedule changed" refusal refetches the data and keeps the value.
 *
 * Key the component using it by what it saves, so another target starts
 * afresh.
 */
export const useSave = <V>({
  draft: keeping,
  equals = (a, b) => a === b,
  scheduleId,
  saved,
  write,
  run,
}: {
  /** Where the unsaved value is kept as a draft; none for a one-tap value. */
  draft?: DraftKeeping<V>
  /** Whether two values save the same; strictly equal ones by default. */
  equals?: (a: V, b: V) => boolean
  /**
   * The Schedule the saved value was read from, or null for a value tied to
   * none, such as the Trip note, which a Schedule change never affects.
   */
  scheduleId: ScheduleId | null
  /** The value as last read from the server. */
  saved: V
  write: TripWrite
  /** Sends the value; throws when the request gets no answer. */
  run: (value: V) => Promise<SaveAnswer>
}) => {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SaveState<V>>(clean)
  const savedRef = useRef(saved)
  savedRef.current = saved
  const scheduleIdRef = useRef(scheduleId)
  scheduleIdRef.current = scheduleId
  const target = keeping?.target
  const drafted = keeping !== undefined
  // The stored draft this field wrote or restored: it only ever clears that
  // one, never one another editor of the target, such as another tab, wrote.
  const ownDraftId = useRef<string>(undefined)

  const storedDraft = () => (keeping ? readDraft(keeping) : undefined)

  const keepDraft = (next: V) => {
    ownDraftId.current = target
      ? writeDraft(target, next, scheduleIdRef.current)
      : undefined

    return ownDraftId.current
  }

  const clearStoredDraft = () => {
    if (target) clearDraft(target)
  }

  const clearOwnDraft = () => {
    if (storedDraft()?.id === ownDraftId.current) clearStoredDraft()
  }

  /** Whether a stored draft holds what its Schedule, shown now, has saved. */
  const savedAlready = (draft: Draft<V>) =>
    draft.scheduleId === scheduleIdRef.current &&
    equals(draft.value, savedRef.current)

  // Stops waiting for the read that confirms the last save.
  const stopAwaitingRead = useRef<() => void>(undefined)
  useEffect(() => () => stopAwaitingRead.current?.(), [])

  // Local storage exists only in the browser, after hydration.
  useEffect(() => {
    const draft = storedDraft()

    if (draft === undefined) return

    if (savedAlready(draft)) clearStoredDraft()
    else {
      ownDraftId.current = draft.id
      setState(
        SaveState.NotSaved({
          value: draft.value,
          // Typed for a Schedule since replaced, it's never saved there unseen.
          problem:
            draft.scheduleId === scheduleIdRef.current
              ? restoredProblem
              : scheduleChangedProblem(true),
        }),
      )
    }
  }, [target])

  // An edit made for a Schedule that has since been replaced is kept, but
  // marked as for a changed Schedule, so it's never saved there unseen.
  const shownScheduleId = useRef(scheduleId)
  useEffect(() => {
    if (shownScheduleId.current === scheduleId) return
    shownScheduleId.current = scheduleId
    setState((current) =>
      (SaveState.$is('Editing')(current) ||
        SaveState.$is('NotSaved')(current)) &&
      !equals(current.value, savedRef.current)
        ? SaveState.NotSaved({
            value: current.value,
            problem: scheduleChangedProblem(drafted),
          })
        : current,
    )
  }, [scheduleId])

  // Data read later holding a value marked not saved means it was saved after
  // all, such as a restored draft whose save, from before the field was
  // reopened, has since landed. Only new data does this, never typing; and
  // never for a draft typed for another Schedule, which equal text there
  // doesn't save.
  const lastSaved = useRef(saved)
  useEffect(() => {
    if (equals(lastSaved.current, saved)) return
    lastSaved.current = saved
    const draft = storedDraft()
    const own = draft !== undefined && draft.id === ownDraftId.current

    if (own && draft.scheduleId !== scheduleIdRef.current) return

    if (own && savedAlready(draft)) clearStoredDraft()
    setState((current) =>
      SaveState.$is('NotSaved')(current) && equals(current.value, saved)
        ? clean
        : current,
    )
  }, [saved, target])

  const value = SaveState.$is('Clean')(state) ? saved : state.value

  const edit = () => setState(SaveState.Editing({ value }))

  const change = (next: V) => {
    if (SaveState.$is('Saving')(state)) return

    if (equals(next, savedRef.current)) clearOwnDraft()
    else keepDraft(next)
    setState(
      SaveState.$is('NotSaved')(state)
        ? { ...state, value: next }
        : SaveState.Editing({ value: next }),
    )
  }

  const discard = () => {
    clearOwnDraft()
    setState(clean)
  }

  const saveValue = async (sending: V) => {
    const sentTo = scheduleIdRef.current
    const draftId = keepDraft(sending)
    setState(SaveState.Saving({ value: sending }))
    let answer: SaveAnswer

    try {
      answer = await run(sending)
    } catch {
      answer = SaveAnswer.Refused({ problem: unansweredProblem(drafted) })
    }

    // Data read during the save showing another Schedule means the value was
    // meant for one no longer shown, whatever the answer: keep it, refused,
    // so it is never saved to the new one unseen.
    if (scheduleIdRef.current !== sentTo) {
      answer = SaveAnswer.ScheduleChanged()
    }

    if (SaveAnswer.$is('Saved')(answer)) {
      // Another editor of the target, in this tab or another, may have kept
      // a newer draft since, even with the same value.
      if (draftId !== undefined && storedDraft()?.id === draftId) {
        clearStoredDraft()
      }

      // The next successful read of what the write affects (its refetch, or
      // a later one if that fails) shows what the server holds, even a value
      // equal to the one before the save.
      stopAwaitingRead.current?.()

      const stop = subscribeToReadsAfter(queryClient, write, () => {
        stop()
        setState((current) =>
          SaveState.$is('Saved')(current)
            ? SaveState.Clean({ justSaved: true })
            : current,
        )
      })

      stopAwaitingRead.current = stop
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
    }
  }

  /** Saves the value being edited, or retries one not saved. */
  const save = async () => {
    if (SaveState.$is('Editing')(state) || SaveState.$is('NotSaved')(state)) {
      await saveValue(state.value)
    }
  }

  /** Saves a value at once, for a one-tap control such as a tick. */
  const send = async (next: V) => {
    if (!SaveState.$is('Saving')(state)) await saveValue(next)
  }

  return { state, value, edit, change, discard, save, send }
}

/**
 * A text field saved with an explicit Save under the save pattern, kept as a
 * draft under its target. Key the component using it by its target.
 */
export const useDraftedField = ({
  target,
  ...options
}: {
  /** What the value is for, such as the Day note on a date. */
  target: string
} & Omit<Parameters<typeof useSave<string>>[0], 'draft' | 'equals'>) =>
  useSave({ draft: { target, isValue: Predicate.isString }, ...options })
