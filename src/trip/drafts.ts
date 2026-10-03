// The save pattern every edit uses. What Phillip types is kept as a draft in
// the browser's local storage, keyed by its target (such as the Day note on
// 2026-12-14), until a save succeeds, so no failed save, login reload or
// closed app loses it. A draft is never saved behind his back: only his Save
// or Retry sends it.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { currentConnection } from '@/access/connection-status'
import type { IsoDate, ScheduleId } from '@/trip/domain'
import { invalidateAfter, invalidateAfterScheduleChanged } from '@/trip/queries'
import type { TripWrite } from '@/trip/queries'

const storageKey = (target: string) => `draft:${target}`

/**
 * A stored draft. Each write has its own id, so a save clears only the draft
 * it wrote, never a later one with the same text.
 */
interface Draft {
  readonly value: string
  readonly id: string
}

// Storage can be unavailable or full; the field still holds the text then.
const readDraft = (target: string): Draft | undefined => {
  try {
    const stored = localStorage.getItem(storageKey(target))
    if (stored === null) return undefined
    const draft: unknown = JSON.parse(stored)
    return typeof draft === 'object' &&
      draft !== null &&
      'value' in draft &&
      typeof draft.value === 'string' &&
      'id' in draft &&
      typeof draft.id === 'string'
      ? { value: draft.value, id: draft.id }
      : undefined
  } catch {
    return undefined
  }
}

/** Keeps a value as the target's draft, returning that write's id. */
const writeDraft = (target: string, value: string) => {
  const draft: Draft = { value, id: crypto.randomUUID() }
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

/** What a save answered, when it got an answer. */
export type SaveAnswer =
  | { readonly _tag: 'Saved' }
  /** The screen named a Schedule that is no longer current. */
  | { readonly _tag: 'ScheduleChanged' }
  | { readonly _tag: 'Refused'; readonly problem: string }

/**
 * A drafted field, by what it shows.
 *
 * - Clean: the saved value, unedited; just saved once a save brought it.
 * - Editing: Phillip's unsaved value, never sent.
 * - Saving: the value on its way. It can't change until the answer comes, so
 *   two saves never race.
 * - NotSaved: a value whose save failed or was refused, or a draft restored
 *   from an earlier visit, with why. It stays marked while edited.
 * - Saved: the value just saved, until data is read again after it.
 */
export type DraftedFieldState =
  | { readonly _tag: 'Clean'; readonly justSaved: boolean }
  | { readonly _tag: 'Editing'; readonly value: string }
  | { readonly _tag: 'Saving'; readonly value: string }
  | {
      readonly _tag: 'NotSaved'
      readonly value: string
      readonly problem: string
    }
  | { readonly _tag: 'Saved'; readonly value: string }

const clean: DraftedFieldState = { _tag: 'Clean', justSaved: false }

const restoredProblem =
  'This is what you typed here last time. Save it, or discard it.'
const scheduleChangedProblem =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

/** Why a save got no answer, from what the request showed. */
const unansweredProblem = () =>
  currentConnection()._tag === 'LoginExpired'
    ? 'Your login expired. Your text is kept here; log in again, then retry.'
    : 'The app couldn’t reach the server. Your text is kept here; retry when you’re back online.'

/**
 * A field saved with an explicit Save under the save pattern, as a whole
 * value. Before each save its value is written as a draft; only a successful
 * save clears it, and invalidates the queries the write affects. On mount, a
 * draft left by an earlier visit or a login reload is restored, marked not
 * saved. A "Schedule changed" refusal refetches the data and keeps the value.
 *
 * Key the component using it by its target, so another target starts afresh.
 */
export const useDraftedField = ({
  target,
  scheduleId,
  saved,
  write,
  run,
}: {
  /** What the value is for, such as the Day note on a date. */
  target: string
  /** The Schedule the saved value was read from. */
  scheduleId: ScheduleId
  /** The value as last read from the server. */
  saved: string
  write: TripWrite
  /** Sends the value; throws when the request gets no answer. */
  run: (value: string) => Promise<SaveAnswer>
}) => {
  const queryClient = useQueryClient()
  const [state, setState] = useState<DraftedFieldState>(clean)
  const savedRef = useRef(saved)
  savedRef.current = saved
  const scheduleIdRef = useRef(scheduleId)
  scheduleIdRef.current = scheduleId

  // Local storage exists only in the browser, after hydration.
  useEffect(() => {
    const draft = readDraft(target)
    if (draft === undefined) return
    if (draft.value === savedRef.current) clearDraft(target)
    else {
      setState({
        _tag: 'NotSaved',
        value: draft.value,
        problem: restoredProblem,
      })
    }
  }, [target])

  // An edit made for a Schedule that has since been replaced is kept, but
  // marked as for a changed Schedule, so it's never saved there unseen.
  const shownScheduleId = useRef(scheduleId)
  useEffect(() => {
    if (shownScheduleId.current === scheduleId) return
    shownScheduleId.current = scheduleId
    setState((current) =>
      (current._tag === 'Editing' || current._tag === 'NotSaved') &&
      current.value !== savedRef.current
        ? {
            _tag: 'NotSaved',
            value: current.value,
            problem: scheduleChangedProblem,
          }
        : current,
    )
  }, [scheduleId])

  // When the refetch after a save failed, data read later ends Saved: a new
  // value, or another Schedule's, which may hold the same value.
  useEffect(() => {
    setState((current) =>
      current._tag === 'Saved' ? { _tag: 'Clean', justSaved: true } : current,
    )
  }, [saved, scheduleId])

  const value = state._tag === 'Clean' ? saved : state.value

  const edit = () => setState({ _tag: 'Editing', value })

  const change = (next: string) => {
    if (state._tag === 'Saving') return
    if (next === savedRef.current) clearDraft(target)
    else writeDraft(target, next)
    setState(
      state._tag === 'NotSaved'
        ? { ...state, value: next }
        : { _tag: 'Editing', value: next },
    )
  }

  const discard = () => {
    clearDraft(target)
    setState(clean)
  }

  const save = async () => {
    if (state._tag !== 'Editing' && state._tag !== 'NotSaved') return
    const sending = state.value
    const sentTo = scheduleIdRef.current
    const draftId = writeDraft(target, sending)
    setState({ _tag: 'Saving', value: sending })
    let answer: SaveAnswer
    try {
      answer = await run(sending)
    } catch {
      answer = { _tag: 'Refused', problem: unansweredProblem() }
    }
    // Data read during the save showing another Schedule means the value
    // went to one that is no longer shown: keep it, as if refused.
    if (answer._tag === 'Saved' && scheduleIdRef.current !== sentTo) {
      answer = { _tag: 'ScheduleChanged' }
    }
    if (answer._tag === 'Saved') {
      // Another editor of the target, in this tab or another, may have kept
      // a newer draft since, even with the same text.
      if (readDraft(target)?.id === draftId) clearDraft(target)
      // Data read during the save may already show the value.
      setState(
        savedRef.current === sending
          ? { _tag: 'Clean', justSaved: true }
          : { _tag: 'Saved', value: sending },
      )
      // Once the refetch completes, the field shows what the server holds,
      // even a value equal to the one before the save.
      const refetched = await invalidateAfter(queryClient, write, {
        throwOnError: true,
      }).then(
        () => true,
        () => false,
      )
      if (refetched) {
        setState((current) =>
          current._tag === 'Saved'
            ? { _tag: 'Clean', justSaved: true }
            : current,
        )
      }
      return
    }
    setState({
      _tag: 'NotSaved',
      value: sending,
      problem:
        answer._tag === 'ScheduleChanged'
          ? scheduleChangedProblem
          : answer.problem,
    })
    if (answer._tag === 'ScheduleChanged') {
      await invalidateAfterScheduleChanged(queryClient)
    }
  }

  return { state, value, edit, change, discard, save }
}
