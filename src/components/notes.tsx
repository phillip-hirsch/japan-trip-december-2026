import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { PencilIcon } from 'lucide-react'

import { EditorFrame } from '@/components/editor-frame'
import { NoteText } from '@/components/note-text'
import { Textarea } from '@/components/ui/textarea'
import type { IsoDate, ScheduleId } from '@/trip/domain/domain'
import {
  answerOwn,
  dayNoteTarget,
  SaveAnswer,
  stayNoteTarget,
  tripNoteTarget,
  useSave,
} from '@/trip/client/drafts'
import type { SaveField } from '@/trip/client/drafts'
import { noteMaxLength } from '@/trip/domain/limits'
import {
  writeDayNote,
  writeStayNote,
  writeTripNote,
} from '@/trip/trip/trip.functions'

const nearsTheCap = (note: string) => note.length >= noteMaxLength - 1_000

const tooLong =
  (noun: string) =>
  ({ maxLength }: { readonly maxLength: number }) =>
    SaveAnswer.Refused({
      problem: `A ${noun} can be at most ${maxLength.toLocaleString('en')} characters.`,
    })

/** The Day note on a Day of the Schedule shown, saved as `note`. */
export const useDayNote = ({
  scheduleId,
  date,
  note,
}: {
  scheduleId: ScheduleId
  date: IsoDate
  note: string | undefined
}) => {
  const write = useServerFn(writeDayNote)

  return useSave({
    target: dayNoteTarget(date),
    draft: Predicate.isString,
    scheduleId,
    saved: note ?? '',
    write: 'dayNote',
    run: async (value) =>
      answerOwn(
        await write({ data: { scheduleId, date, note: value } }),
        tooLong('Day note'),
      ),
  })
}

/** The Stay note on a Stay of the Schedule shown, saved as `note`. */
export const useStayNote = ({
  scheduleId,
  stayId,
  note,
}: {
  scheduleId: ScheduleId
  stayId: string
  note: string | undefined
}) => {
  const write = useServerFn(writeStayNote)

  return useSave({
    target: stayNoteTarget(stayId),
    draft: Predicate.isString,
    scheduleId,
    saved: note ?? '',
    write: 'stayNote',
    run: async (value) =>
      answerOwn(
        await write({ data: { scheduleId, stayId, note: value } }),
        tooLong('Stay note'),
      ),
  })
}

/**
 * Phillip's Trip note, saved as `note`. It belongs to the Trip, not a
 * Schedule, so a Schedule change never marks it.
 */
export const useTripNote = ({ note }: { note: string | undefined }) => {
  const write = useServerFn(writeTripNote)

  return useSave({
    target: tripNoteTarget,
    draft: Predicate.isString,
    scheduleId: null,
    saved: note ?? '',
    write: 'tripNote',
    run: async (value) =>
      answerOwn(await write({ data: { note: value } }), tooLong('Trip note')),
  })
}

function NoteFrame({
  field,
  labelledBy,
  emptyText,
  textClassName = 'text-base leading-relaxed',
}: {
  field: SaveField<string>
  labelledBy: string
  emptyText?: string
  textClassName?: string
}) {
  const { value } = field

  return (
    <EditorFrame
      field={field}
      labelledBy={labelledBy}
      summary={
        value === '' ? (
          emptyText !== undefined && (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )
        ) : (
          <NoteText text={value} className={textClassName} />
        )
      }
      edits={[
        {
          label: value === '' ? 'Add a note' : 'Edit note',
          icon: PencilIcon,
          onClick: field.edit,
        },
      ]}
      nameForm={false}
      actions={() =>
        nearsTheCap(value) && (
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {value.length.toLocaleString('en')} /{' '}
            {noteMaxLength.toLocaleString('en')}
          </p>
        )
      }
    >
      {(frame) => (
        <Textarea
          aria-labelledby={labelledBy}
          aria-describedby={frame.describedBy}
          autoFocus={frame.autoFocus}
          readOnly={frame.locked}
          value={value}
          onChange={(event) => field.change(event.target.value)}
          maxLength={noteMaxLength}
          rows={5}
          className="min-h-32 text-base leading-relaxed md:text-base"
        />
      )}
    </EditorFrame>
  )
}

export function DayNote({
  labelledBy,
  ...props
}: Parameters<typeof useDayNote>[0] & { labelledBy: string }) {
  const field = useDayNote(props)

  return (
    <NoteFrame field={field} labelledBy={labelledBy} emptyText="No note yet." />
  )
}

export function StayNote({
  labelledBy,
  ...props
}: Parameters<typeof useStayNote>[0] & { labelledBy: string }) {
  const field = useStayNote(props)

  return (
    <NoteFrame field={field} labelledBy={labelledBy} textClassName="text-sm" />
  )
}

export function TripNote({
  labelledBy,
  ...props
}: Parameters<typeof useTripNote>[0] & { labelledBy: string }) {
  const field = useTripNote(props)

  return (
    <NoteFrame
      field={field}
      labelledBy={labelledBy}
      emptyText="No Trip note yet. It stays as it is when you choose again."
    />
  )
}
