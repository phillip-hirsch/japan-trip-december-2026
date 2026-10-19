import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { MergeIcon, SplitIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { DateChoice } from '@/components/date-choice'
import { EditorFrame } from '@/components/editor-frame'
import type { SaveVerb } from '@/components/editor-frame'
import { answerStayEdit } from '@/components/schedule-rules'
import { StaySection } from '@/components/stay-section'
import type { StayEditorProps } from '@/components/stay-section'
import { formatShortDate, tripDates } from '@/trip/domain/calendar'
import type { IsoDate, ScheduleStayDetail } from '@/trip/domain/domain'
import {
  SaveAnswer,
  SaveState,
  splitMergeTarget,
  useSave,
} from '@/trip/client/drafts'
import { mergeStays, splitStay } from '@/trip/trip/trip.functions'

/** Splitting a Stay on a date, or merging it with the Stay after it. */
export type SplitOrMerge =
  | { readonly kind: 'split'; readonly date: IsoDate | undefined }
  | { readonly kind: 'merge'; readonly next: ScheduleStayDetail }

const labels = {
  split: {
    submit: 'Split',
    submitting: 'Splitting…',
    done: 'Split',
    anchorBroken: 'The split breaks an Anchor',
    withdrawn: 'This Stay has only one night now, so it can’t be split.',
  },
  merge: {
    submit: 'Merge',
    submitting: 'Merging…',
    done: 'Merged',
    anchorBroken: 'The merge breaks an Anchor',
    withdrawn: 'This Stay can no longer merge with the next one.',
  },
} as const

/**
 * Splitting a Stay of the Schedule shown on a night after its check-in, or
 * merging it with `next`, the Stay after it, while both are in one Base.
 * A retry of a choice goes under its operation, so it splits or merges
 * once. A choice kept across a Schedule change gets a new operation for the
 * Schedule now shown.
 */
export const useSplitMergeStay = ({
  scheduleId,
  stay,
  next,
  anchorWarnings,
}: StayEditorProps) => {
  const split = useServerFn(splitStay)
  const merge = useServerFn(mergeStays)
  const [lastKind, setLastKind] = useState<SplitOrMerge['kind']>('split')

  const splitDates = tripDates.filter(
    (date) => stay.checkIn < date && date < stay.checkOut,
  )

  const mergeable = next?.base.id === stay.base.id ? next : undefined

  const field = useSave<SplitOrMerge>({
    target: splitMergeTarget(stay.id),
    offered: (choice) =>
      choice === undefined
        ? splitDates.length > 0 || mergeable !== undefined
        : choice.kind === 'split'
          ? splitDates.length > 0
          : choice.next.id === mergeable?.id,
    scheduleId,
    write: 'stayEdit',
    run: async (choice, operationId) => {
      setLastKind(choice.kind)

      const answer = answerStayEdit(
        labels[choice.kind].anchorBroken,
        anchorWarnings,
      )

      if (choice.kind === 'merge') {
        return answer(
          await merge({
            data: {
              scheduleId,
              operationId,
              stayIds: [stay.id, choice.next.id],
            },
          }),
        )
      }

      if (choice.date === undefined) {
        return SaveAnswer.Refused({ problem: 'Choose a date to split on.' })
      }

      return answer(
        await split({
          data: {
            scheduleId,
            operationId,
            stayId: stay.id,
            date: choice.date,
          },
        }),
      )
    },
  })

  // Until the Schedule is re-read, the Stays shown predate the edit just
  // saved, so a choice made from them would split or merge the wrong nights.
  const canChoose = !SaveState.$is('Saved')(field.state)

  const change = (choice: SplitOrMerge) => {
    if (canChoose) field.change(choice)
  }

  const kind = field.value?.kind ?? lastKind
  const verb: SaveVerb = labels[kind]

  return {
    ...field,
    change,
    canChoose,
    splitDates,
    mergeable,
    verb,
    withdrawnReason: labels[kind].withdrawn,
  }
}

export function SplitMergeStay(props: StayEditorProps) {
  const { stay } = props
  const field = useSplitMergeStay(props)
  const hintId = useId()

  if (!field.shown) return null

  const { value, splitDates, mergeable } = field
  const base = stay.base.romaji

  const splitDate =
    value?.kind === 'split'
      ? splitDates.find((date) => date === value.date)
      : undefined

  const edits = [
    splitDates.length > 0 && {
      label: 'Split Stay',
      icon: SplitIcon,
      onClick: () => field.change({ kind: 'split', date: undefined }),
      disabled: !field.canChoose,
    },
    mergeable !== undefined && {
      label: 'Merge with next Stay',
      icon: MergeIcon,
      onClick: () => field.change({ kind: 'merge', next: mergeable }),
      disabled: !field.canChoose,
    },
  ].filter((edit) => edit !== false)

  return (
    <StaySection heading="Split or merge" stay={stay}>
      {(headingId) => (
        <EditorFrame
          field={field}
          labelledBy={headingId}
          verb={field.verb}
          edits={edits}
          withdrawnReason={field.withdrawnReason}
          hintId={hintId}
          ready={value?.kind !== 'split' || splitDate !== undefined}
          buttonSize="sm"
        >
          {(frame) =>
            value?.kind === 'split' ? (
              <fieldset
                className="flex flex-col gap-2"
                aria-describedby={frame.describedBy}
              >
                <legend className="mb-2 text-sm">Split on</legend>
                <DateChoice
                  dates={splitDates}
                  value={splitDate}
                  disabled={frame.busy}
                  onChange={(date) => field.change({ kind: 'split', date })}
                />
                <p id={hintId} className="text-sm text-muted-foreground">
                  This Stay keeps the nights before, with its hotel and note. A
                  new {base} Stay starts that day, after a local Move.
                </p>
              </fieldset>
            ) : (
              value?.kind === 'merge' && (
                <p id={hintId} className="text-sm">
                  This Stay takes the nights of the {base} Stay from{' '}
                  {formatShortDate(value.next.checkIn)} and runs to{' '}
                  {formatShortDate(value.next.checkOut)}. It keeps its own hotel
                  and note.
                  {(Predicate.isTagged('Recorded')(value.next.hotel) ||
                    value.next.note !== undefined) &&
                    ' Merging removes the next Stay’s hotel details and note.'}
                </p>
              )
            )
          }
        </EditorFrame>
      )}
    </StaySection>
  )
}
