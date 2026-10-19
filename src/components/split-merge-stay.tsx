import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { MergeIcon, SplitIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { DateChoice } from '@/components/date-choice'
import { EditorFrame } from '@/components/editor-frame'
import type { EditAction, SaveVerb } from '@/components/editor-frame'
import { answerStayEdit } from '@/components/schedule-rules'
import { StaySection } from '@/components/stay-section'
import { formatShortDate, tripDates } from '@/trip/domain/calendar'
import type {
  AnchorWarning,
  IsoDate,
  ScheduleId,
  ScheduleStayDetail,
} from '@/trip/domain/domain'
import { keyedBy, SaveAnswer, useOfferedSave } from '@/trip/client/drafts'
import { mergeStays, splitStay } from '@/trip/trip/trip.functions'

/** Splitting a Stay on a date, or merging it with the Stay after it. */
export type SplitOrMerge =
  | { readonly kind: 'split'; readonly date: IsoDate | undefined }
  | { readonly kind: 'merge'; readonly next: ScheduleStayDetail }

type Choice = SplitOrMerge & { readonly operationId: string }

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
 * Each choice is a fresh operation, so a retry of it splits or merges once.
 */
export const useSplitMergeStay = ({
  scheduleId,
  stay,
  next,
  anchorWarnings,
}: {
  scheduleId: ScheduleId
  stay: ScheduleStayDetail
  next: ScheduleStayDetail | undefined
  anchorWarnings: ReadonlyArray<AnchorWarning>
}) => {
  const split = useServerFn(splitStay)
  const merge = useServerFn(mergeStays)
  const [lastKind, setLastKind] = useState<Choice['kind']>('split')

  const splitDates = tripDates.filter(
    (date) => stay.checkIn < date && date < stay.checkOut,
  )

  const mergeable = next?.base.id === stay.base.id ? next : undefined

  const field = useOfferedSave<Choice | null>({
    offered: (choice) =>
      choice === null
        ? splitDates.length > 0 || mergeable !== undefined
        : choice.kind === 'split'
          ? splitDates.length > 0
          : choice.next.id === mergeable?.id,
    scheduleId,
    saved: null,
    write: 'stayEdit',
    run: async (choice) => {
      if (choice === null) return SaveAnswer.Saved()

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
              operationId: choice.operationId,
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
            operationId: choice.operationId,
            stayId: stay.id,
            date: choice.date,
          },
        }),
      )
    },
  })

  const change = (choice: SplitOrMerge) =>
    field.change({ ...choice, operationId: crypto.randomUUID() })

  const kind = field.value?.kind ?? lastKind
  const verb: SaveVerb = labels[kind]

  return {
    ...field,
    change,
    splitDates,
    mergeable,
    verb,
    withdrawnReason: labels[kind].withdrawn,
  }
}

function SplitMergeStayEditor(props: Parameters<typeof useSplitMergeStay>[0]) {
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

  const edits: ReadonlyArray<EditAction> = [
    ...(splitDates.length > 0
      ? [
          {
            label: 'Split Stay',
            icon: SplitIcon,
            onClick: () => field.change({ kind: 'split', date: undefined }),
          },
        ]
      : []),
    ...(mergeable
      ? [
          {
            label: 'Merge with next Stay',
            icon: MergeIcon,
            onClick: () => field.change({ kind: 'merge', next: mergeable }),
          },
        ]
      : []),
  ]

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
          canSave={value?.kind !== 'split' || splitDate !== undefined}
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

export const SplitMergeStay = keyedBy(
  SplitMergeStayEditor,
  ({ stay }) => stay.id,
)
