import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { CalendarIcon } from 'lucide-react'
import { useId } from 'react'

import { DateChoice } from '@/components/date-choice'
import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { stayEditAnswerOf } from '@/components/schedule-rules'
import { StaySection, WithdrawnStayEdit } from '@/components/stay-section'
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
import {
  keyedBy,
  SaveState,
  stayBoundaryTarget,
  useOfferedSave,
} from '@/trip/drafts'
import { moveStayBoundary } from '@/trip/trip.functions'

const isDate = (value: unknown): value is IsoDate =>
  Predicate.isString(value) && isTripDate(value)

/** The Stay's check-out, which moves while another Stay follows it. */
function StayBoundaryForm({
  scheduleId,
  stay,
  next,
  anchorWarnings,
}: {
  scheduleId: ScheduleId
  stay: ScheduleStayDetail
  next: ScheduleStayDetail | undefined
  anchorWarnings: ReadonlyArray<AnchorWarning>
}) {
  const move = useServerFn(moveStayBoundary)

  const field = useOfferedSave<IsoDate>({
    offered: () => next !== undefined,
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

  if (!field.shown) return null

  return (
    <StaySection heading="Check-out" stay={stay}>
      {(headingId) =>
        next === undefined ? (
          <WithdrawnStayEdit
            labelledBy={headingId}
            state={field.state}
            reason="This is now your last Stay, so its check-out can’t move."
            onDiscard={field.discard}
          />
        ) : (
          <StayBoundaryChoice
            field={field}
            stay={stay}
            next={next}
            labelledBy={headingId}
          />
        )
      }
    </StaySection>
  )
}

function StayBoundaryChoice({
  field,
  stay,
  next,
  labelledBy,
}: {
  field: ReturnType<typeof useOfferedSave<IsoDate>>
  stay: ScheduleStayDetail
  next: ScheduleStayDetail
  labelledBy: string
}) {
  const hintId = useId()
  const problemId = useId()
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

  const chosenStillOffered = dates.find((date) => date === value)

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
          value={chosenStillOffered}
          disabled={saving}
          onChange={field.change}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {chosenStillOffered === undefined
            ? `The Stays next to this one have changed. Choose the date ${stay.base.romaji} checks out again.`
            : `${formatNights(nightsBetween(stay.checkIn, chosenStillOffered))} in ${stay.base.romaji}, then ${formatNights(nightsBetween(chosenStillOffered, next.checkOut))} in ${next.base.romaji}. Your Move to ${next.base.romaji} changes to that day too.`}
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={saving || chosenStillOffered === undefined}
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

export const StayBoundaryField = keyedBy(
  StayBoundaryForm,
  ({ stay }) => stay.id,
)
