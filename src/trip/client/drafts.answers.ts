import { Data, Match, Predicate } from 'effect'

import { formatDay } from '@/trip/domain/calendar'
import type { IsoDate } from '@/trip/domain/domain'

export type SaveAnswer = Data.TaggedEnum<{
  Saved: {}
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
 * What every write can answer: it was written, or the Day, Stay, Activity or
 * Checklist item it was for no longer exists. The save
 * flow answers these alike for every editor.
 */
export type SharedOutcome =
  | { readonly [T in WrittenTag]: { readonly _tag: T } }[WrittenTag]
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

/** The answer a reply gives, and the warning it comes with, if any. */
export const answerOf = (
  reply: SaveReply,
): { readonly answer: SaveAnswer; readonly warning?: SaveWarning } => {
  const { reply: answered, warning } = Predicate.isTagged(reply, 'Warned')
    ? reply
    : { reply, warning: undefined }

  const answer = Match.value(answered).pipe(
    Match.tagsExhaustive({
      ...sharedAnswers,
      Saved: (answer) => answer,
      Refused: (answer) => answer,
      Gone: (answer) => answer,
    }),
  )

  return warning === undefined ? { answer } : { answer, warning }
}
