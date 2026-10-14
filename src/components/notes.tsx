import { useServerFn } from '@tanstack/react-start'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { NoteText } from '@/components/note-text'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { IsoDate, ScheduleId } from '@/trip/domain'
import {
  answerOwn,
  dayNoteTarget,
  keyedBy,
  SaveState,
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

const nearsTheCap = (note: string) => note.length >= noteMaxLength - 1_000

const tooLong = (noun: string, maxLength: number) =>
  SaveAnswer.Refused({
    problem: `A ${noun} can be at most ${maxLength.toLocaleString('en')} characters.`,
  })

function NoteEditor({
  labelledBy,
  emptyText,
  textClassName = 'text-base leading-relaxed',
  ...options
}: Parameters<typeof useDraftedField>[0] & {
  labelledBy: string
  emptyText?: string
  textClassName?: string
}) {
  const field = useDraftedField(options)
  const problemId = useId()
  const { state, value } = field

  if (SaveState.$is('Clean')(state) || SaveState.$is('Saved')(state)) {
    const justSaved = SaveState.$is('Saved')(state) || state.justSaved

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
          <SavedStatus saved={justSaved}>Saved</SavedStatus>
        </div>
      </div>
    )
  }

  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void field.save()
      }}
    >
      {notSaved && (
        <NotSavedAlert problem={state.problem} problemId={problemId} />
      )}
      <Textarea
        aria-labelledby={labelledBy}
        aria-describedby={notSaved ? problemId : undefined}
        // Opening the editor focuses it; a restored draft opens unfocused.
        autoFocus={SaveState.$is('Editing')(state)}
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
        {nearsTheCap(value) && (
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {value.length.toLocaleString('en')} /{' '}
            {noteMaxLength.toLocaleString('en')}
          </p>
        )}
      </div>
    </form>
  )
}

const NoteField = keyedBy(NoteEditor, ({ target }) => target)

export function DayNote({
  scheduleId,
  date,
  note,
  labelledBy,
}: {
  scheduleId: ScheduleId
  date: IsoDate
  note: string | undefined
  labelledBy: string
}) {
  const write = useServerFn(writeDayNote)

  return (
    <NoteField
      target={dayNoteTarget(date)}
      scheduleId={scheduleId}
      saved={note ?? ''}
      write="dayNote"
      run={async (value) =>
        answerOwn(
          await write({ data: { scheduleId, date, note: value } }),
          ({ maxLength }) => tooLong('Day note', maxLength),
        )
      }
      labelledBy={labelledBy}
      emptyText="No note yet."
    />
  )
}

export function StayNote({
  scheduleId,
  stayId,
  note,
  labelledBy,
}: {
  scheduleId: ScheduleId
  stayId: string
  note: string | undefined
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
        answerOwn(
          await write({ data: { scheduleId, stayId, note: value } }),
          ({ maxLength }) => tooLong('Stay note', maxLength),
        )
      }
      labelledBy={labelledBy}
      textClassName="text-sm"
    />
  )
}

/**
 * Phillip's Trip note. It belongs to the Trip, not a Schedule, so a Schedule
 * change never marks it.
 */
export function TripNote({
  note,
  labelledBy,
}: {
  note: string | undefined
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
        answerOwn(await write({ data: { note: value } }), ({ maxLength }) =>
          tooLong('Trip note', maxLength),
        )
      }
      labelledBy={labelledBy}
      emptyText="No Trip note yet. It stays as it is when you choose again."
    />
  )
}
