import { useServerFn } from '@tanstack/react-start'
import { Match } from 'effect'
import { CalendarIcon } from 'lucide-react'
import { useId } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { AnchorWarnings, hardRuleProblem } from '@/components/schedule-rules'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  formatDay,
  formatNights,
  formatShortDate,
  formatWeekday,
  nightsBetween,
  tripDates,
} from '@/trip/calendar'
import type {
  AnchorWarning,
  IsoDate,
  ScheduleId,
  ScheduleStayDetail,
  StayEditOutcome,
} from '@/trip/domain'
import { SaveAnswer, SaveState, useSave } from '@/trip/drafts'
import { moveStayBoundary } from '@/trip/trip.functions'

const answerOf = (outcome: StayEditOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Edited: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      StayNotFound: () =>
        SaveAnswer.Gone({
          problem: 'This Stay is no longer part of your Schedule.',
        }),
      HardRuleBroken: ({ rule }) =>
        SaveAnswer.Refused({ problem: hardRuleProblem(rule) }),
    }),
  )

/**
 * The date a Stay checks out and the next Stay checks in, moved with an
 * explicit Save under the save pattern (`@/trip/drafts`). The Move between
 * them moves too. It offers only dates that leave both Stays a night. Just
 * after a move, the Schedule's Anchor warnings show here as well as at the
 * top of the page. Key it by the Stay's id.
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
  /** The Schedule's Anchor warnings, as last read. */
  anchorWarnings: ReadonlyArray<AnchorWarning>
  /** The id of the heading naming the check-out. */
  labelledBy: string
}) {
  const move = useServerFn(moveStayBoundary)
  const fieldId = useId()
  const hintId = useId()
  const problemId = useId()

  const field = useSave<IsoDate>({
    scheduleId,
    saved: stay.checkOut,
    write: 'stayEdit',
    run: async (checkOut) =>
      answerOf(await move({ data: { scheduleId, stayId: stay.id, checkOut } })),
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
        {/* Only once the read after the move brings its warnings. */}
        {SaveState.$is('Clean')(state) && state.justSaved && (
          <AnchorWarnings warnings={anchorWarnings} />
        )}
      </div>
    )
  }

  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)

  const dates = tripDates.filter(
    (date) => date > stay.checkIn && date < next.checkOut,
  )

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
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm text-muted-foreground">
          Check out on
        </label>
        <NativeSelect
          id={fieldId}
          aria-describedby={notSaved ? `${hintId} ${problemId}` : hintId}
          // Opening the editor focuses it.
          autoFocus={SaveState.$is('Editing')(state)}
          // A save in flight fixes the value, so two saves never race.
          disabled={saving}
          value={value}
          onChange={(event) => {
            const date = dates.find((each) => each === event.target.value)

            if (date !== undefined) field.change(date)
          }}
          className="w-full sm:w-fit"
        >
          {dates.map((date) => (
            <NativeSelectOption key={date} value={date}>
              {formatWeekday(date)}, {formatShortDate(date)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p id={hintId} className="text-sm text-muted-foreground">
          {formatNights(nightsBetween(stay.checkIn, value))} in{' '}
          {stay.base.romaji}, then{' '}
          {formatNights(nightsBetween(value, next.checkOut))} in{' '}
          {next.base.romaji}. Your Move to {next.base.romaji} changes to that
          day too.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : notSaved ? 'Retry' : 'Save'}
        </Button>
        <Button
          type="button"
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
