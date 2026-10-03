// The save pattern every edit uses. What Phillip types is kept as a draft in
// the browser's local storage, keyed by its target (such as the Day note on
// 2026-12-14), until a save succeeds, so no failed save, login reload or
// closed app loses it. A draft is never saved behind his back: only his Save
// or Retry sends it.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { IsoDate } from '@/trip/domain'
import { invalidateAfter, invalidateAfterScheduleChanged } from '@/trip/queries'
import type { TripWrite } from '@/trip/queries'

const storageKey = (target: string) => `draft:${target}`

// Storage can be unavailable or full; the field still holds the text then.
const readDraft = (target: string) => {
  try {
    return localStorage.getItem(storageKey(target)) ?? undefined
  } catch {
    return undefined
  }
}

const writeDraft = (target: string, value: string) => {
  try {
    localStorage.setItem(storageKey(target), value)
  } catch {
    // Nothing else can keep it; the field still holds it.
  }
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
 * - Clean: the saved value, unedited.
 * - Editing: Phillip's unsaved value, never sent.
 * - Saving: the value on its way.
 * - NotSaved: a value whose save failed or was refused, or a draft restored
 *   from an earlier visit, with why.
 * - Saved: the value just saved, until the refetched data shows it.
 */
export type DraftedFieldState =
  | { readonly _tag: 'Clean' }
  | { readonly _tag: 'Editing'; readonly value: string }
  | { readonly _tag: 'Saving'; readonly value: string }
  | {
      readonly _tag: 'NotSaved'
      readonly value: string
      readonly problem: string
    }
  | {
      readonly _tag: 'Saved'
      readonly value: string
      /** The saved value when the save succeeded, until data replaces it. */
      readonly over: string
    }

const clean: DraftedFieldState = { _tag: 'Clean' }

const restoredProblem =
  'This is what you typed here last time. Save it, or discard it.'
const failedProblem =
  'The app couldn’t reach the server. Your text is kept here; retry when you’re back online.'
const scheduleChangedProblem =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

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
  saved,
  write,
  run,
}: {
  /** What the value is for, such as the Day note on a date. */
  target: string
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
  // Only the latest save's answer changes what the field shows.
  const latestSave = useRef(0)

  // Local storage exists only in the browser, after hydration.
  useEffect(() => {
    const draft = readDraft(target)
    if (draft === undefined) return
    if (draft === savedRef.current) clearDraft(target)
    else setState({ _tag: 'NotSaved', value: draft, problem: restoredProblem })
  }, [target])

  const value =
    state._tag === 'Clean'
      ? saved
      : state._tag === 'Saved' && saved !== state.over
        ? saved
        : state.value

  const edit = () => setState({ _tag: 'Editing', value })

  const change = (next: string) => {
    if (next === savedRef.current) clearDraft(target)
    else writeDraft(target, next)
    setState({ _tag: 'Editing', value: next })
  }

  const discard = () => {
    clearDraft(target)
    setState(clean)
  }

  const save = async () => {
    if (state._tag !== 'Editing' && state._tag !== 'NotSaved') return
    const sending = state.value
    const attempt = ++latestSave.current
    writeDraft(target, sending)
    setState({ _tag: 'Saving', value: sending })
    let answer: SaveAnswer
    try {
      answer = await run(sending)
    } catch {
      answer = { _tag: 'Refused', problem: failedProblem }
    }
    const latest = attempt === latestSave.current
    // Typing during the save leaves the newer value, and its draft, in place.
    if (answer._tag === 'Saved') {
      if (readDraft(target) === sending) clearDraft(target)
      const over = savedRef.current
      setState((current) =>
        latest && current._tag === 'Saving'
          ? { _tag: 'Saved', value: sending, over }
          : current,
      )
      await invalidateAfter(queryClient, write)
      return
    }
    const problem =
      answer._tag === 'ScheduleChanged'
        ? scheduleChangedProblem
        : answer.problem
    setState((current) =>
      latest && (current._tag === 'Saving' || current._tag === 'Editing')
        ? { _tag: 'NotSaved', value: current.value, problem }
        : current,
    )
    if (answer._tag === 'ScheduleChanged') {
      await invalidateAfterScheduleChanged(queryClient)
    }
  }

  return { state, value, edit, change, discard, save }
}
