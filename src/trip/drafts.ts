// The save pattern every edit uses. What Phillip types is kept as a draft in
// the browser's local storage, keyed by its target (such as the Day note on
// 2026-12-14), until a save succeeds, so no failed save, login reload or
// closed app loses it. A draft is never saved behind his back: only his Save
// or Retry sends it.
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
interface Draft {
  readonly value: string
  readonly scheduleId: string | null
  readonly id: string
}

const isDraft = (value: unknown): value is Draft =>
  Predicate.isObject(value) &&
  Predicate.isString(value.value) &&
  (Predicate.isString(value.scheduleId) ||
    Predicate.isNull(value.scheduleId)) &&
  Predicate.isString(value.id)

// Storage can be unavailable or full; the field still holds the text then.
const readDraft = (target: string): Draft | undefined => {
  try {
    const stored = localStorage.getItem(storageKey(target))

    if (stored === null) return undefined

    const draft: unknown = JSON.parse(stored)

    return isDraft(draft)
      ? { value: draft.value, scheduleId: draft.scheduleId, id: draft.id }
      : undefined
  } catch {
    return undefined
  }
}

/** Keeps a value as the target's draft, returning that write's id. */
const writeDraft = (
  target: string,
  value: string,
  scheduleId: string | null,
) => {
  const draft: Draft = { value, scheduleId, id: crypto.randomUUID() }

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
 * The draft target of the Stay note on the Stay checking in on a date. Not by
 * the Stay's id, which is fresh in each Schedule: like a Day note's, a draft
 * refused because the Schedule changed then reopens on the replacement's
 * Stay, marked as typed for another Schedule.
 */
export const stayNoteTarget = (checkIn: IsoDate) => `stay-note:${checkIn}`

/** The draft target of the Trip note. */
export const tripNoteTarget = 'trip-note'

/** What a save answered, when it got an answer. */
export type SaveAnswer = Data.TaggedEnum<{
  Saved: {}
  ScheduleChanged: {}
  Refused: { readonly problem: string }
}>

export const SaveAnswer = Data.taggedEnum<SaveAnswer>()

/**
 * A drafted field, by what it shows.
 *
 * - Clean: the saved value, unedited; just saved once a save brought it.
 * - Editing: Phillip's unsaved value, never sent.
 * - Saving: the value on its way. It can't change until the answer comes, so
 *   two saves never race.
 * - NotSaved: a value whose save failed or was refused, or a draft restored
 *   from an earlier visit, with why. It stays marked while edited.
 * - Saved: the value just saved, until what it affects is next read.
 */
export type DraftedFieldState = Data.TaggedEnum<{
  Clean: { readonly justSaved: boolean }
  Editing: { readonly value: string }
  Saving: { readonly value: string }
  NotSaved: { readonly value: string; readonly problem: string }
  Saved: { readonly value: string }
}>

export const DraftedFieldState = Data.taggedEnum<DraftedFieldState>()

const clean: DraftedFieldState = DraftedFieldState.Clean({ justSaved: false })

const restoredProblem =
  'This is what you typed here last time. Save it, or discard it.'

const scheduleChangedProblem =
  'Your Schedule changed on another device. This page now shows it as it is; your text is kept here to save again.'

/** Why a save got no answer, from what the request showed. */
const unansweredProblem = () =>
  ConnectionStatus.$is('LoginExpired')(currentConnection())
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
  /**
   * The Schedule the saved value was read from, or null for a value tied to
   * none, such as the Trip note, which a Schedule change never affects.
   */
  scheduleId: ScheduleId | null
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
  // The stored draft this field wrote or restored: it only ever clears that
  // one, never one another editor of the target, such as another tab, wrote.
  const ownDraftId = useRef<string>(undefined)

  const keepDraft = (next: string) => {
    ownDraftId.current = writeDraft(target, next, scheduleIdRef.current)

    return ownDraftId.current
  }

  const clearOwnDraft = () => {
    if (readDraft(target)?.id === ownDraftId.current) clearDraft(target)
  }

  /** Whether a stored draft holds what its Schedule, shown now, has saved. */
  const savedAlready = (draft: Draft) =>
    draft.scheduleId === scheduleIdRef.current &&
    draft.value === savedRef.current

  // Stops waiting for the read that confirms the last save.
  const stopAwaitingRead = useRef<() => void>(undefined)
  useEffect(() => () => stopAwaitingRead.current?.(), [])

  // Local storage exists only in the browser, after hydration.
  useEffect(() => {
    const draft = readDraft(target)

    if (draft === undefined) return

    if (savedAlready(draft)) clearDraft(target)
    else {
      ownDraftId.current = draft.id
      setState(
        DraftedFieldState.NotSaved({
          value: draft.value,
          // Typed for a Schedule since replaced, it's never saved there unseen.
          problem:
            draft.scheduleId === scheduleIdRef.current
              ? restoredProblem
              : scheduleChangedProblem,
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
      (DraftedFieldState.$is('Editing')(current) ||
        DraftedFieldState.$is('NotSaved')(current)) &&
      current.value !== savedRef.current
        ? DraftedFieldState.NotSaved({
            value: current.value,
            problem: scheduleChangedProblem,
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
    if (lastSaved.current === saved) return
    lastSaved.current = saved
    const draft = readDraft(target)
    const own = draft !== undefined && draft.id === ownDraftId.current

    if (own && draft.scheduleId !== scheduleIdRef.current) return

    if (own && savedAlready(draft)) clearDraft(target)
    setState((current) =>
      DraftedFieldState.$is('NotSaved')(current) && current.value === saved
        ? clean
        : current,
    )
  }, [saved, target])

  const value = DraftedFieldState.$is('Clean')(state) ? saved : state.value

  const edit = () => setState(DraftedFieldState.Editing({ value }))

  const change = (next: string) => {
    if (DraftedFieldState.$is('Saving')(state)) return

    if (next === savedRef.current) clearOwnDraft()
    else keepDraft(next)
    setState(
      DraftedFieldState.$is('NotSaved')(state)
        ? { ...state, value: next }
        : DraftedFieldState.Editing({ value: next }),
    )
  }

  const discard = () => {
    clearOwnDraft()
    setState(clean)
  }

  const save = async () => {
    if (
      !DraftedFieldState.$is('Editing')(state) &&
      !DraftedFieldState.$is('NotSaved')(state)
    )
      return
    const sending = state.value
    const sentTo = scheduleIdRef.current
    const draftId = keepDraft(sending)
    setState(DraftedFieldState.Saving({ value: sending }))
    let answer: SaveAnswer

    try {
      answer = await run(sending)
    } catch {
      answer = SaveAnswer.Refused({ problem: unansweredProblem() })
    }

    // Data read during the save showing another Schedule means the value was
    // meant for one no longer shown, whatever the answer: keep it, refused,
    // so it is never saved to the new one unseen.
    if (scheduleIdRef.current !== sentTo) {
      answer = SaveAnswer.ScheduleChanged()
    }

    if (SaveAnswer.$is('Saved')(answer)) {
      // Another editor of the target, in this tab or another, may have kept
      // a newer draft since, even with the same text.
      if (readDraft(target)?.id === draftId) clearDraft(target)
      // The next successful read of what the write affects (its refetch, or
      // a later one if that fails) shows what the server holds, even a value
      // equal to the one before the save.
      stopAwaitingRead.current?.()

      const stop = subscribeToReadsAfter(queryClient, write, () => {
        stop()
        setState((current) =>
          DraftedFieldState.$is('Saved')(current)
            ? DraftedFieldState.Clean({ justSaved: true })
            : current,
        )
      })

      stopAwaitingRead.current = stop
      setState(DraftedFieldState.Saved({ value: sending }))
      await invalidateAfter(queryClient, write)

      return
    }

    setState(
      DraftedFieldState.NotSaved({
        value: sending,
        problem: SaveAnswer.$is('ScheduleChanged')(answer)
          ? scheduleChangedProblem
          : answer.problem,
      }),
    )

    if (SaveAnswer.$is('ScheduleChanged')(answer)) {
      await invalidateAfterScheduleChanged(queryClient)
    }
  }

  return { state, value, edit, change, discard, save }
}
