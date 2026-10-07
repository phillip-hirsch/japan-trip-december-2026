import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { CalendarIcon } from 'lucide-react'
import { useId } from 'react'

import { DateChoice } from '@/components/date-choice'
import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { stayEditAnswerOf } from '@/components/schedule-rules'
import { Button } from '@/components/ui/button'
import {
  formatDay,
  formatNights,
  isTripDate,
  nightsBetween,
  tripDates,
} from '@/trip/calendar'
import type {
  AnchorWarning,
  IsoDate,
  ScheduleId,
  ScheduleStayDetail,
} from '@/trip/domain'
import { SaveState, stayBoundaryTarget, useSave } from '@/trip/drafts'
import { moveStayBoundary } from '@/trip/trip.functions'

const isDate = (value: unknown): value is IsoDate =>
  Predicate.isString(value) && isTripDate(value)

/**
 * The date a Stay checks out and the next Stay checks in, moved with an
 * explicit Save under the save pattern (`@/trip/drafts`). The Move between
 * them moves too. It offers only dates that leave both Stays a night, and
 * answers as the other Stay edits do. Key it by the Stay's id.
 */
export function StayBoundaryField({
  scheduleId,
  stay,
  next,
  anchorWarnings,
  labelledBy,
}: {
  scheduleId: ScheduleId
  stay: ScheduleStayDetail
  /** The Stay checking in on the day this one checks out. */
  next: ScheduleStayDetail
  /** The Schedule's Anchor warnings before the move. */
  anchorWarnings: ReadonlyArray<AnchorWarning>
  /** The id of the heading naming the check-out. */
  labelledBy: string
}) {
  const move = useServerFn(moveStayBoundary)
  const hintId = useId()
  const problemId = useId()

  const field = useSave<IsoDate>({
    draft: { target: stayBoundaryTarget(stay.id), isValue: isDate },
    scheduleId,
    saved: stay.checkOut,
    write: 'stayEdit',
    run: async (checkOut) =>
      stayEditAnswerOf(
        'The move breaks an Anchor',
        anchorWarnings,
      )(await move({ data: { scheduleId, stayId: stay.id, checkOut } })),
  })

  const { state, value } = field

  if (SaveState.$is('Clean')(state) || SaveState.$is('Saved')(state)) {
    const justSaved = SaveState.$is('Saved')(state) || state.justSaved

    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">
          Move to {next.base.romaji} on{' '}
          <time dateTime={value}>{formatDay(value)}</time>.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-describedby={labelledBy}
            onClick={field.edit}
          >
            <CalendarIcon data-icon="inline-start" aria-hidden />
            Change date
          </Button>
          <SavedStatus saved={justSaved}>Saved</SavedStatus>
        </div>
      </div>
    )
  }

  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)

  const dates = tripDates.filter(
    (date) => date > stay.checkIn && date < next.checkOut,
  )

  // A move next door, or a draft from an earlier visit, can leave the date
  // chosen outside what the Stays allow now. It's then chosen again.
  const chosen = dates.find((date) => date === value)

  return (
    <form
      aria-labelledby={labelledBy}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void field.save()
      }}
    >
      {notSaved && (
        <NotSavedAlert problem={state.problem} problemId={problemId} />
      )}
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={notSaved ? `${hintId} ${problemId}` : hintId}
      >
        <legend className="mb-2 text-sm">Check out on</legend>
        <DateChoice
          dates={dates}
          value={chosen}
          // A save in flight fixes the value, so two saves never race.
          disabled={saving}
          onChange={field.change}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {chosen === undefined
            ? `The Stays next to this one have changed. Choose the date ${stay.base.romaji} checks out again.`
            : `${formatNights(nightsBetween(stay.checkIn, chosen))} in ${stay.base.romaji}, then ${formatNights(nightsBetween(chosen, next.checkOut))} in ${next.base.romaji}. Your Move to ${next.base.romaji} changes to that day too.`}
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={saving || chosen === undefined}
        >
          {saving ? 'Saving…' : notSaved ? 'Retry' : 'Save'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={field.discard}
        >
          {notSaved ? 'Discard' : 'Cancel'}
        </Button>
      </div>
    </form>
  )
}
