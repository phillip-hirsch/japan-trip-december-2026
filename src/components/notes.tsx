import { useServerFn } from '@tanstack/react-start'
import { Match } from 'effect'
import { CheckIcon, PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { NoteText } from '@/components/note-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDay } from '@/trip/calendar'
import type {
  IsoDate,
  ScheduleId,
  WriteDayNoteOutcome,
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
} from '@/trip/domain'
import {
  dayNoteTarget,
  DraftedFieldState,
  SaveAnswer,
  stayNoteTarget,
  tripNoteTarget,
  useDraftedField,
} from '@/trip/drafts'
import { noteMaxLength } from '@/trip/limits'
import {
  writeDayNote,
  writeStayNote,
  writeTripNote,
} from '@/trip/trip.functions'

// The count shows only once the note nears the cap.
const countFrom = noteMaxLength - 1_000

const tooLong = (noun: string, maxLength: number) =>
  SaveAnswer.Refused({
    problem: `A ${noun} can be at most ${maxLength.toLocaleString('en')} characters.`,
  })

/**
 * A plain-text note saved as a whole with an explicit Save under the save
 * pattern (`@/trip/drafts`). Shown as text with its web links clickable;
 * edited in place. Key it by its target.
 */
function NoteField({
  labelledBy,
  emptyText,
  textClassName = 'text-base leading-relaxed',
  ...options
}: Parameters<typeof useDraftedField>[0] & {
  /** The id of the heading naming the note. */
  labelledBy: string
  /** What shows while there is no note; nothing when absent. */
  emptyText?: string
  /** The size of the note's text when shown. */
  textClassName?: string
}) {
  const field = useDraftedField(options)
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
          emptyText !== undefined && (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )
        ) : (
          <NoteText text={value} className={textClassName} />
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-describedby={labelledBy}
            onClick={field.edit}
          >
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
        maxLength={noteMaxLength}
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
            {noteMaxLength.toLocaleString('en')}
          </p>
        )}
      </div>
    </form>
  )
}

const dayNoteAnswerOf = (outcome: WriteDayNoteOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Written: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      DayNotFound: (outcome) =>
        SaveAnswer.Refused({
          problem: `${formatDay(outcome.date)} is no longer a Day of your Schedule. Your text is kept here.`,
        }),
      NoteTooLong: (outcome) => tooLong('Day note', outcome.maxLength),
    }),
  )

/** Phillip's Day note on a Day of the Schedule. Key it by its date. */
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

  return (
    <NoteField
      target={dayNoteTarget(date)}
      scheduleId={scheduleId}
      saved={note ?? ''}
      write="dayNote"
      // The Schedule this screen shows now, so a retry after a refusal names
      // the Schedule the refreshed page shows.
      run={async (value) =>
        dayNoteAnswerOf(
          await write({ data: { scheduleId, date, note: value } }),
        )
      }
      labelledBy={labelledBy}
      emptyText="No note yet."
    />
  )
}

const stayNoteAnswerOf = (outcome: WriteStayNoteOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Written: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      StayNotFound: () =>
        SaveAnswer.Refused({
          problem:
            'This Stay is no longer part of your Schedule. Your text is kept here.',
        }),
      NoteTooLong: (outcome) => tooLong('Stay note', outcome.maxLength),
    }),
  )

/** Phillip's Stay note on a Stay of the Schedule. Key it by the Stay's id. */
export function StayNote({
  scheduleId,
  stayId,
  note,
  labelledBy,
}: {
  scheduleId: ScheduleId
  stayId: string
  note: string | undefined
  /** The id of the heading naming the note. */
  labelledBy: string
}) {
  const write = useServerFn(writeStayNote)

  return (
    <NoteField
      target={stayNoteTarget(stayId)}
      scheduleId={scheduleId}
      saved={note ?? ''}
      write="stayNote"
      run={async (value) =>
        stayNoteAnswerOf(
          await write({ data: { scheduleId, stayId, note: value } }),
        )
      }
      labelledBy={labelledBy}
      textClassName="text-sm"
    />
  )
}

const tripNoteAnswerOf = (outcome: WriteTripNoteOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Written: () => SaveAnswer.Saved(),
      NoteTooLong: (outcome) => tooLong('Trip note', outcome.maxLength),
    }),
  )

/**
 * Phillip's Trip note. It belongs to the Trip, not a Schedule, so a Schedule
 * change never marks it.
 */
export function TripNote({
  note,
  labelledBy,
}: {
  note: string | undefined
  /** The id of the heading naming the note. */
  labelledBy: string
}) {
  const write = useServerFn(writeTripNote)

  return (
    <NoteField
      target={tripNoteTarget}
      scheduleId={null}
      saved={note ?? ''}
      write="tripNote"
      run={async (value) =>
        tripNoteAnswerOf(await write({ data: { note: value } }))
      }
      labelledBy={labelledBy}
      emptyText="No Trip note yet. It stays as it is when you choose again."
    />
  )
}
