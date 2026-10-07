import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { MergeIcon, SplitIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { DateChoice } from '@/components/date-choice'
import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { stayEditAnswerOf } from '@/components/schedule-rules'
import { StaySection } from '@/components/stay-section'
import { Button } from '@/components/ui/button'
import { formatShortDate, tripDates } from '@/trip/calendar'
import type { IsoDate, ScheduleDetail, ScheduleStayDetail } from '@/trip/domain'
import { SaveAnswer, SaveState, useSave } from '@/trip/drafts'
import { mergeStays, splitStay } from '@/trip/trip.functions'

/**
 * The Stay edit being made on a Stay: a split at a date, none chosen yet, or
 * a merge with the next Stay as it was when Phillip chose to merge. It keeps
 * its operation id and its target across retries, so a split or merge whose
 * answer was lost is never made twice, nor made on another Stay.
 */
type Choice =
  | {
      readonly kind: 'split'
      readonly date: IsoDate | undefined
      readonly operationId: string
    }
  | {
      readonly kind: 'merge'
      readonly next: ScheduleStayDetail
      readonly operationId: string
    }

/** What each Stay edit's controls say. */
const labels = {
  split: {
    submit: 'Split',
    submitting: 'Splitting…',
    done: 'Split',
    anchorBroken: 'The split breaks an Anchor',
  },
  merge: {
    submit: 'Merge',
    submitting: 'Merging…',
    done: 'Merged',
    anchorBroken: 'The merge breaks an Anchor',
  },
} as const

/**
 * Splitting a Stay at a date inside it, or merging it with the next Stay
 * when that one is in the same Base, on the current Schedule. One edit at a
 * time on a Stay; nothing shows for a one-night Stay with nothing to merge.
 * Key it by the Stay's id.
 */
export function SplitMergeStay({
  schedule,
  stay,
}: {
  schedule: ScheduleDetail
  stay: ScheduleStayDetail
}) {
  const split = useServerFn(splitStay)
  const merge = useServerFn(mergeStays)
  const [lastKind, setLastKind] = useState<Choice['kind']>('split')
  const scheduleId = schedule.id

  const splitDates = tripDates.filter(
    (date) => stay.checkIn < date && date < stay.checkOut,
  )

  const next = schedule.stays[schedule.stays.indexOf(stay) + 1]

  const mergeable =
    next !== undefined &&
    next.base.id === stay.base.id &&
    next.checkIn === stay.checkOut
      ? next
      : undefined

  const field = useSave<Choice | null>({
    scheduleId,
    saved: null,
    write: 'stayEdit',
    run: async (choice) => {
      if (choice === null) return SaveAnswer.Saved()

      setLastKind(choice.kind)

      const answer = stayEditAnswerOf(
        labels[choice.kind].anchorBroken,
        schedule.anchorWarnings,
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

  if (splitDates.length === 0 && mergeable === undefined) return null

  const { state, value } = field

  return (
    <StaySection heading="Split or merge" stay={stay}>
      {(headingId) =>
        SaveState.$is('Clean')(state) || value === null ? (
          <div className="flex flex-wrap items-center gap-3">
            {splitDates.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                aria-describedby={headingId}
                onClick={() =>
                  field.change({
                    kind: 'split',
                    date: undefined,
                    operationId: crypto.randomUUID(),
                  })
                }
              >
                <SplitIcon data-icon="inline-start" aria-hidden />
                Split Stay
              </Button>
            )}
            {mergeable && (
              <Button
                variant="outline"
                size="sm"
                aria-describedby={headingId}
                onClick={() =>
                  field.change({
                    kind: 'merge',
                    next: mergeable,
                    operationId: crypto.randomUUID(),
                  })
                }
              >
                <MergeIcon data-icon="inline-start" aria-hidden />
                Merge with next Stay
              </Button>
            )}
            <SavedStatus
              saved={SaveState.$is('Clean')(state) && state.justSaved}
            >
              {labels[lastKind].done}
            </SavedStatus>
          </div>
        ) : (
          <ChoiceForm
            labelledBy={headingId}
            state={state}
            choice={value}
            stay={stay}
            splitDates={splitDates}
            onChange={field.change}
            onSubmit={() => void field.save()}
            onDiscard={field.discard}
          />
        )
      }
    </StaySection>
  )
}

/** The split's date or the merge's confirmation, with what sends it. */
function ChoiceForm({
  labelledBy,
  state,
  choice,
  stay,
  splitDates,
  onChange,
  onSubmit,
  onDiscard,
}: {
  labelledBy: string
  state: SaveState<Choice | null>
  choice: Choice
  stay: ScheduleStayDetail
  splitDates: ReadonlyArray<IsoDate>
  onChange: (choice: Choice) => void
  onSubmit: () => void
  onDiscard: () => void
}) {
  const hintId = useId()
  const problemId = useId()
  const saving = SaveState.$is('Saving')(state) || SaveState.$is('Saved')(state)
  const notSaved = SaveState.$is('NotSaved')(state)
  const base = stay.base.romaji

  const verbs = labels[choice.kind]

  return (
    <form
      aria-labelledby={labelledBy}
      aria-describedby={hintId}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {notSaved && (
        <NotSavedAlert problem={state.problem} problemId={problemId} />
      )}
      {choice.kind === 'split' ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={notSaved ? problemId : undefined}
        >
          <legend className="mb-2 text-sm">Split on</legend>
          <DateChoice
            dates={splitDates}
            value={choice.date}
            disabled={saving}
            onChange={(date) =>
              onChange({
                kind: 'split',
                date,
                operationId: crypto.randomUUID(),
              })
            }
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            This Stay keeps the nights before, with its hotel and note. A new{' '}
            {base} Stay starts that day, after a local Move.
          </p>
        </fieldset>
      ) : (
        <p id={hintId} className="text-sm">
          This Stay takes the nights of the {base} Stay from{' '}
          {formatShortDate(choice.next.checkIn)} and runs to{' '}
          {formatShortDate(choice.next.checkOut)}. It keeps its own hotel and
          note.
          {(Predicate.isTagged('Recorded')(choice.next.hotel) ||
            choice.next.note !== undefined) &&
            ' Merging removes the next Stay’s hotel details and note.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            saving || (choice.kind === 'split' && choice.date === undefined)
          }
        >
          {saving ? verbs.submitting : notSaved ? 'Retry' : verbs.submit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={onDiscard}
        >
          {notSaved ? 'Discard' : 'Cancel'}
        </Button>
      </div>
    </form>
  )
}
