import { useServerFn } from '@tanstack/react-start'
import { Match } from 'effect'
import { CheckIcon, PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { NoteText } from '@/components/note-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDay } from '@/trip/calendar'
import type { IsoDate, ScheduleId, WriteDayNoteOutcome } from '@/trip/domain'
import {
  dayNoteTarget,
  DraftedFieldState,
  SaveAnswer,
  useDraftedField,
} from '@/trip/drafts'
import { dayNoteMaxLength } from '@/trip/limits'
import { writeDayNote } from '@/trip/trip.functions'

// The count shows only once the note nears the cap.
const countFrom = dayNoteMaxLength - 1_000

const answerOf = (outcome: WriteDayNoteOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Written: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      DayNotFound: (outcome) =>
        SaveAnswer.Refused({
          problem: `${formatDay(outcome.date)} is no longer a Day of your Schedule. Your text is kept here.`,
        }),
      DayNoteTooLong: (outcome) =>
        SaveAnswer.Refused({
          problem: `A Day note can be at most ${outcome.maxLength.toLocaleString('en')} characters.`,
        }),
    }),
  )

/**
 * Phillip's plain-text note on a Day, saved as a whole with an explicit Save
 * under the save pattern (`@/trip/drafts`). Shown as text with its web links
 * clickable; edited in place. Key it by its date.
 */
export function DayNote({
  scheduleId,
  date,
  note,
  labelledBy,
}: {
  scheduleId: ScheduleId
  date: IsoDate
  note: string | undefined
  /** The id of the heading naming the note. */
  labelledBy: string
}) {
  const write = useServerFn(writeDayNote)

  const field = useDraftedField({
    target: dayNoteTarget(date),
    scheduleId,
    saved: note ?? '',
    write: 'dayNote',
    // The Schedule this screen shows now, so a retry after a refusal names
    // the Schedule the refreshed page shows.
    run: async (value) =>
      answerOf(await write({ data: { scheduleId, date, note: value } })),
  })

  const problemId = useId()
  const { state, value } = field

  if (
    DraftedFieldState.$is('Clean')(state) ||
    DraftedFieldState.$is('Saved')(state)
  ) {
    const justSaved = DraftedFieldState.$is('Saved')(state) || state.justSaved

    return (
      <div className="flex flex-col items-start gap-3">
        {value === '' ? (
          <p className="text-sm text-muted-foreground">No note yet.</p>
        ) : (
          <NoteText text={value} className="text-base leading-relaxed" />
        )}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={field.edit}>
            <PencilIcon data-icon="inline-start" aria-hidden />
            {value === '' ? 'Add a note' : 'Edit note'}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {justSaved && (
              <span className="inline-flex items-center gap-1">
                <CheckIcon className="size-4" aria-hidden />
                Saved
              </span>
            )}
          </p>
        </div>
      </div>
    )
  }

  const notSaved = DraftedFieldState.$is('NotSaved')(state)
  const saving = DraftedFieldState.$is('Saving')(state)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void field.save()
      }}
    >
      {notSaved && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <Badge variant="outline" className="border-primary text-primary">
            Not saved
          </Badge>
          <p id={problemId} className="text-sm">
            {state.problem}
          </p>
        </div>
      )}
      <Textarea
        aria-labelledby={labelledBy}
        aria-describedby={notSaved ? problemId : undefined}
        // Opening the editor focuses it; a restored draft opens unfocused.
        autoFocus={DraftedFieldState.$is('Editing')(state)}
        // A save in flight fixes the value, so two saves never race.
        readOnly={saving}
        value={value}
        onChange={(event) => field.change(event.target.value)}
        maxLength={dayNoteMaxLength}
        rows={5}
        className="min-h-32 text-base leading-relaxed md:text-base"
      />
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
        {value.length >= countFrom && (
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {value.length.toLocaleString('en')} /{' '}
            {dayNoteMaxLength.toLocaleString('en')}
          </p>
        )}
      </div>
    </form>
  )
}
