import { useQueryClient } from '@tanstack/react-query'
import { Data, Match, Predicate } from 'effect'
import { createElement, useEffect, useRef, useState } from 'react'
import type { FunctionComponent } from 'react'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import { toast } from '@/components/ui/toast'
import { formatDay } from '@/trip/calendar'
import type { IsoDate, PinTarget, ScheduleId } from '@/trip/domain'
import {
  invalidateAfter,
  invalidateAfterScheduleChanged,
  subscribeToReadsAfter,
} from '@/trip/queries'
import type { TripWrite } from '@/trip/queries'

const storageKey = (target: string) => `draft:${target}`

interface Draft<V> {
  readonly value: V
  readonly scheduleId: string | null
  readonly writeId: string
}

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
      ? { value: draft.value, scheduleId: draft.scheduleId, writeId: draft.id }
      : undefined
  } catch {
    return undefined
  }
}

const writeDraft = <V>(target: string, value: V, scheduleId: string | null) => {
  const writeId = crypto.randomUUID()

  try {
    localStorage.setItem(
      storageKey(target),
      JSON.stringify({ value, scheduleId, id: writeId }),
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

export const dayNoteTarget = (date: IsoDate) => `day-note:${date}`

/**
 * The draft target of the Stay note on a Stay, by its id. Not by its dates:
 * a Stay keeps its id when they change, and another Schedule's Stay checking
 * in on the same date may be somewhere else entirely. Its id is fresh in each
 * Schedule, so a draft refused because the Schedule changed is kept, and
 * reopens only if its own Schedule is restored.
 */
export const stayNoteTarget = (stayId: string) => `stay-note:${stayId}`

export const hotelDetailsTarget = (stayId: string) => `hotel-details:${stayId}`

export const stayBoundaryTarget = (stayId: string) => `stay-boundary:${stayId}`

export const tripNoteTarget = 'trip-note'

export const newActivityTarget = (date: IsoDate) => `activity:new:${date}`

export const activityTarget = (activityId: string) => `activity:${activityId}`

export const pinTarget = (target: PinTarget) =>
  'activityId' in target
    ? `pin:activity:${target.activityId}`
    : `pin:hotel:${target.stayId}`

export const newChecklistItemTarget = 'checklist-item:new'

export type SaveAnswer = Data.TaggedEnum<{
  Saved: {}
  ScheduleChanged: {}
  Refused: { readonly problem: string }
  /**
   * What the value was for no longer exists, such as an item removed on
   * another device: what the write affects is refetched, so it goes away.
   */
  Gone: { readonly problem: string }
}>

export const SaveAnswer = Data.taggedEnum<SaveAnswer>()

type WrittenTag =
  | 'Written'
  | 'Added'
  | 'Edited'
  | 'Set'
  | 'Ticked'
  | 'Removed'
  | 'Moved'

/**
 * What every write can answer: it was written, the Schedule changed, or the
 * Day, Stay, Activity or Checklist item it was for no longer exists. The save
 * flow answers these alike for every editor.
 */
export type SharedOutcome =
  | { readonly [T in WrittenTag]: { readonly _tag: T } }[WrittenTag]
  | { readonly _tag: 'ScheduleChanged' }
  | { readonly _tag: 'DayNotFound'; readonly date: IsoDate }
  | { readonly _tag: 'StayNotFound' }
  | { readonly _tag: 'ActivityNotFound' }
  | { readonly _tag: 'ChecklistItemNotFound' }

/** The outcomes of a write only its editor answers. */
export type OwnOutcome<O> = Exclude<O, SharedOutcome>

const saved = () => SaveAnswer.Saved()

const sharedAnswers = {
  Written: saved,
  Added: saved,
  Edited: saved,
  Set: saved,
  Ticked: saved,
  Removed: saved,
  Moved: saved,
  ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
  DayNotFound: ({ date }: { readonly date: IsoDate }) =>
    SaveAnswer.Gone({
      problem: `${formatDay(date)} is no longer a Day of your Schedule, perhaps changed on another device.`,
    }),
  StayNotFound: () =>
    SaveAnswer.Gone({
      problem:
        'This Stay is no longer part of your Schedule, perhaps changed on another device.',
    }),
  ActivityNotFound: () =>
    SaveAnswer.Gone({
      problem:
        'This Activity is no longer on this Day, perhaps removed on another device.',
    }),
  ChecklistItemNotFound: () =>
    SaveAnswer.Gone({
      problem:
        'This item is no longer on your Checklist, perhaps removed on another device.',
    }),
} satisfies {
  readonly [T in SharedOutcome['_tag']]: (
    outcome: Extract<SharedOutcome, { readonly _tag: T }>,
  ) => SaveAnswer
}

const isShared = <O extends { readonly _tag: string }>(
  outcome: O,
): outcome is Extract<O, SharedOutcome> =>
  Object.hasOwn(sharedAnswers, outcome._tag)

/**
 * Answers an outcome only this editor has, such as a note that is too long,
 * with `own`. The outcomes every write shares pass through to the save flow.
 */
export const answerOwn = <O extends { readonly _tag: string }>(
  outcome: O,
  own: (outcome: OwnOutcome<O>) => SaveAnswer,
): SaveAnswer | Extract<O, SharedOutcome> => {
  if (isShared(outcome)) return outcome

  // SAFETY: isShared refused it, so it is one of O's own outcomes; TypeScript
  // doesn't narrow a type parameter where a guard fails.
  return own(outcome as OwnOutcome<O>)
}

/**
 * A warning shown once a save is answered, about what the field itself can't
 * show, such as an Anchor a Stay edit broke.
 */
export interface SaveWarning {
  readonly title: string
  readonly description: string
}

class Warned extends Data.TaggedClass('Warned')<{
  readonly reply: SaveAnswer | SharedOutcome
  readonly warning: SaveWarning
}> {}

/** What `run` answers: an outcome or answer, perhaps with a warning. */
export type SaveReply = SaveAnswer | SharedOutcome | Warned

/** A reply the save flow shows `warning` with, once it comes. */
export const warned = (
  reply: SaveAnswer | SharedOutcome,
  warning: SaveWarning | undefined,
): SaveReply => (warning === undefined ? reply : new Warned({ reply, warning }))

const answerOf = (reply: SaveAnswer | SharedOutcome): SaveAnswer =>
  Match.value(reply).pipe(
    Match.tagsExhaustive({
      ...sharedAnswers,
      Saved: (answer) => answer,
      Refused: (answer) => answer,
      Gone: (answer) => answer,
    }),
  )

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

/**
 * A value saved as a whole under the save pattern. Before each save a value
 * with a draft target is written as its draft; only a successful save clears
 * it, and invalidates the queries the write affects. On mount, a draft left
 * by an earlier visit or a login reload is restored, marked not saved. A
 * "Schedule changed" refusal refetches the data and keeps the value, and so
 * does an answer that what it was for is gone. Every other refusal keeps the
 * value without refetching.
 *
 * Key the component using it by what it saves, as keyedBy does, so another
 * target starts afresh.
 */
export const useSave = <V>({
  draft: keeping,
  equals = (a, b) => a === b,
  scheduleId,
  saved,
  write,
  run,
}: {
  draft?: DraftKeeping<V>
  equals?: (a: V, b: V) => boolean
  /**
   * The Schedule the saved value was read from, or null for a value tied to
   * none, such as the Trip note, which a Schedule change never affects.
   */
  scheduleId: ScheduleId | null
  saved: V
  write: TripWrite
  /**
   * Sends the value, answering the outcomes only this editor has, as
   * `answerOwn` does; throws when the request gets no answer.
   */
  run: (value: V) => Promise<SaveReply>
}) => {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SaveState<V>>(clean)
  const savedRef = useRef(saved)
  savedRef.current = saved
  const scheduleIdRef = useRef(scheduleId)
  scheduleIdRef.current = scheduleId
  const target = keeping?.target
  const drafted = keeping !== undefined
  const ownDraftWriteId = useRef<string>(undefined)

  const storedDraft = () => (keeping ? readDraft(keeping) : undefined)

  const keepDraft = (
    next: V,
    typedFor: string | null = scheduleIdRef.current,
  ) => {
    ownDraftWriteId.current = target
      ? writeDraft(target, next, typedFor)
      : undefined

    return ownDraftWriteId.current
  }

  const clearStoredDraft = () => {
    if (target) clearDraft(target)
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
    !typedForAnotherSchedule(draft) && equals(draft.value, savedRef.current)

  const markedForChangedSchedule = (current: SaveState<V>) =>
    (SaveState.$is('Editing')(current) || SaveState.$is('NotSaved')(current)) &&
    !equals(current.value, savedRef.current)
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
      setState((current) =>
        SaveState.$is('Saved')(current)
          ? SaveState.Clean({ justSaved: true })
          : current,
      )
    })

    stopAwaitingRead.current = stop
  }

  useEffect(() => {
    const draft = storedDraft()

    if (draft === undefined) return

    if (savedAlready(draft)) clearStoredDraft()
    else {
      ownDraftWriteId.current = draft.writeId
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

  useOnChange(scheduleId, () => setState(markedForChangedSchedule))

  useOnChange(
    saved,
    (latest) => {
      const draft = storedDraft()

      const own =
        draft !== undefined && draft.writeId === ownDraftWriteId.current

      if (own && typedForAnotherSchedule(draft)) return

      if (own && savedAlready(draft)) clearStoredDraft()
      setState(savedAfterAll(latest))
    },
    equals,
  )

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

  /**
   * Replaces a NotSaved value without Phillip editing it, such as to give it
   * a fresh operation id. Its draft stays marked for the Schedule it was typed
   * for, so it is restored saying that Schedule changed.
   */
  const renew = (next: V) => {
    if (!SaveState.$is('NotSaved')(state)) return

    const draft = storedDraft()

    if (draft !== undefined && draft.writeId === ownDraftWriteId.current) {
      keepDraft(next, draft.scheduleId)
    }

    setState((current) =>
      SaveState.$is('NotSaved')(current)
        ? { ...current, value: next }
        : current,
    )
  }

  const discard = () => {
    clearOwnDraft()
    setState(clean)
  }

  const saveValue = async (sending: V) => {
    const sentTo = scheduleIdRef.current
    const sentDraftWriteId = keepDraft(sending)
    setState(SaveState.Saving({ value: sending }))
    let reply: SaveReply

    let mayHaveLanded = false

    try {
      reply = await run(sending)
    } catch {
      mayHaveLanded = true
      reply = SaveAnswer.Refused({ problem: unansweredProblem(drafted) })
    }

    if (Predicate.isTagged(reply, 'Warned')) {
      toast.add({ type: 'warning', ...reply.warning })
      reply = reply.reply
    }

    let answer = answerOf(reply)

    const shownScheduleChanged = scheduleIdRef.current !== sentTo

    if (shownScheduleChanged) answer = SaveAnswer.ScheduleChanged()

    if (SaveAnswer.$is('Saved')(answer)) {
      clearDraftIfStill(sentDraftWriteId)
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
    if (SaveState.$is('Editing')(state) || SaveState.$is('NotSaved')(state)) {
      await saveValue(state.value)
    }
  }

  const send = async (next: V) => {
    if (!SaveState.$is('Saving')(state)) await saveValue(next)
  }

  return { state, value, edit, change, renew, discard, save, send }
}

/**
 * A text field saved with an explicit Save under the save pattern, kept as a
 * draft under its target. Key the component using it by its target.
 */
export const useDraftedField = ({
  target,
  ...options
}: {
  target: string
} & Omit<Parameters<typeof useSave<string>>[0], 'draft' | 'equals'>) =>
  useSave({ draft: { target, isValue: Predicate.isString }, ...options })

/**
 * A save of an edit the Schedule shown may stop offering, such as a merge
 * with the next Stay once another device moves it to another Base.
 * `offered` says whether the Schedule offers a value; the saved value stands
 * for the edit before Phillip chooses one.
 *
 * An edit Phillip has open stays shown once withdrawn, with any refusal,
 * until he discards it; saving it sends nothing.
 */
export const useOfferedSave = <V>({
  offered,
  ...options
}: Parameters<typeof useSave<V>>[0] & {
  offered: (value: V) => boolean
}) => {
  const field = useSave(options)

  const open =
    SaveState.$is('Editing')(field.state) ||
    SaveState.$is('NotSaved')(field.state)

  const stillOffered = offered(field.value)
  const withdrawn = open && !stillOffered

  const save = async () => {
    if (!withdrawn) await field.save()
  }

  return { ...field, shown: stillOffered || open, withdrawn, save }
}

export const useOperationSave = <
  V extends {
    readonly operationId: string
    readonly operationScheduleId?: string
  },
>(
  options: Parameters<typeof useSave<V>>[0],
) => {
  const field = useSave(options)
  const { scheduleId } = options

  const freshOperation = (next: V): V => ({
    ...next,
    operationId: crypto.randomUUID(),
    ...(scheduleId !== null && { operationScheduleId: scheduleId }),
  })

  const change = (next: V) => field.change(freshOperation(next))

  const operationForAnotherSchedule =
    SaveState.$is('NotSaved')(field.state) &&
    scheduleId !== null &&
    field.value.operationScheduleId !== scheduleId

  useEffect(() => {
    if (operationForAnotherSchedule) field.renew(freshOperation(field.value))
  }, [field.state, scheduleId])

  return { ...field, change }
}

export const keyedBy = <P extends object>(
  Component: FunctionComponent<P>,
  subjectOf: (props: P) => string,
) => {
  const Keyed = (props: P) =>
    createElement(Component, { ...props, key: subjectOf(props) })

  return Keyed
}
