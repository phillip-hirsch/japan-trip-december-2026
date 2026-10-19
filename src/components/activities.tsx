import { useServerFn } from '@tanstack/react-start'
import { Match, Predicate } from 'effect'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'

import {
  NotSavedAlert,
  RetryOrDismiss,
  SavedStatus,
} from '@/components/not-saved-alert'
import { NoteText } from '@/components/note-text'
import { PinField } from '@/components/pin-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { timeOfDayOf, timeOfDayPattern } from '@/trip/domain/calendar'
import type {
  Activity,
  Coordinates,
  EditActivityOutcome,
  IsoDate,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  ScheduleId,
} from '@/trip/domain/domain'
import {
  activityTarget,
  answerOwn,
  keyedBy,
  newActivityTarget,
  SaveAnswer,
  SaveState,
  useOperationSave,
  useSave,
  warned,
} from '@/trip/client/drafts'
import type {
  DraftKeeping,
  OwnOutcome,
  SaveWarning,
} from '@/trip/client/drafts'
import { activityTitleMaxLength, noteMaxLength } from '@/trip/domain/limits'
import {
  addActivity,
  editActivity,
  moveActivity,
  removeActivity,
} from '@/trip/trip/trip.functions'

interface ActivityFields {
  readonly title: string
  readonly time: string
  readonly note: string
}

const sameFields = (a: ActivityFields, b: ActivityFields) =>
  a.title === b.title && a.time === b.time && a.note === b.note

const isActivityFields: Predicate.Refinement<unknown, ActivityFields> = (
  value,
): value is ActivityFields =>
  Predicate.isObject(value) &&
  Predicate.isString(value.title) &&
  Predicate.isString(value.time) &&
  Predicate.isString(value.note)

const fieldsOf = ({ title, time, note }: Activity): ActivityFields => ({
  title,
  time: time === undefined ? '' : timeOfDayOf(time),
  note: note ?? '',
})

const timeRefusal = (time: string) =>
  time === '' || timeOfDayPattern.test(time)
    ? undefined
    : SaveAnswer.Refused({
        problem: 'Choose a time as hours and minutes, or leave it empty.',
      })

const titleInvalid = (maxLength: number) =>
  SaveAnswer.Refused({
    problem: `An Activity needs a title, at most ${maxLength} characters.`,
  })

const noteTooLong = (maxLength: number) =>
  SaveAnswer.Refused({
    problem: `An Activity’s note can be at most ${maxLength.toLocaleString('en')} characters.`,
  })

const activityRefusal = (outcome: OwnOutcome<EditActivityOutcome>) =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      ActivityTitleInvalid: ({ maxLength }) => titleInvalid(maxLength),
      NoteTooLong: ({ maxLength }) => noteTooLong(maxLength),
    }),
  )

/** Removing an Activity already gone counts as saved. */
const removalAnswerOf = (outcome: RemoveActivityOutcome) =>
  Predicate.isTagged('ActivityNotFound')(outcome) ? SaveAnswer.Saved() : outcome

const notMoved: SaveWarning = {
  title: 'The Activity wasn’t moved',
  description:
    'The one it was moving past was removed, perhaps on another device. Move it again if you still want to.',
}

/** The Activity a move was to pass is gone, so nothing moved. */
const passedActivityGone = (moving: string, outcome: MoveActivityOutcome) =>
  Predicate.isTagged('ActivityNotFound')(outcome) &&
  outcome.activityId !== moving

function ActivityEditor({
  state,
  value,
  onChange,
  onSubmit,
  onDiscard,
  verbs,
  children,
}: {
  state: SaveState<ActivityFields>
  value: ActivityFields
  onChange: (next: Partial<ActivityFields>) => void
  onSubmit: () => void
  onDiscard: () => void
  verbs: { readonly submit: string; readonly submitting: string }
  children?: ReactNode
}) {
  const titleId = useId()
  const timeId = useId()
  const noteId = useId()
  const problemId = useId()
  const saving = SaveState.$is('Saving')(state)
  const notSaved = SaveState.$is('NotSaved')(state)
  const settling = saving || SaveState.$is('Saved')(state)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {notSaved && (
        <NotSavedAlert problem={state.problem} problemId={problemId} />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1.5 sm:flex-1">
          <label htmlFor={titleId} className="text-sm text-muted-foreground">
            Title
          </label>
          <Input
            id={titleId}
            aria-describedby={notSaved ? problemId : undefined}
            // Opening the editor focuses it; a restored draft opens unfocused.
            autoFocus={SaveState.$is('Editing')(state)}
            value={value.title}
            onChange={(event) => onChange({ title: event.target.value })}
            readOnly={settling}
            required
            maxLength={activityTitleMaxLength}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor={timeId} className="text-sm text-muted-foreground">
            Tokyo time (optional)
          </label>
          <Input
            id={timeId}
            type="time"
            value={value.time}
            onChange={(event) => onChange({ time: event.target.value })}
            readOnly={settling}
            className="h-10"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-sm text-muted-foreground">
          Note (optional)
        </label>
        <Textarea
          id={noteId}
          value={value.note}
          onChange={(event) => onChange({ note: event.target.value })}
          readOnly={settling}
          maxLength={noteMaxLength}
          rows={3}
          className="min-h-20 text-base md:text-base"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={settling || value.title.trim() === ''}>
          {saving ? verbs.submitting : notSaved ? 'Retry' : verbs.submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={settling}
          onClick={onDiscard}
        >
          {notSaved ? 'Discard' : 'Cancel'}
        </Button>
        {children}
      </div>
    </form>
  )
}

interface ActivityEdit extends ActivityFields {
  readonly from: ActivityFields
}

function ActivityRow({
  activity,
  scheduleId,
  near,
  beforeWhenUp,
  beforeWhenDown,
  onMove,
  onRemove,
  dayOrderUnsettled,
  moving,
  removal,
  alerts,
}: {
  activity: Activity
  scheduleId: ScheduleId
  near: Coordinates
  beforeWhenUp: string | undefined
  beforeWhenDown: string | null | undefined
  onMove: (before: string | null) => void
  onRemove: () => void
  dayOrderUnsettled: boolean
  moving: boolean
  removal: SaveState<string | null> | undefined
  alerts: ReactNode
}) {
  const titleId = useId()
  const edit = useServerFn(editActivity)
  const fields = fieldsOf(activity)

  const editing = useSave<ActivityEdit>({
    draft: {
      target: activityTarget(activity.id),
      isValue: (value): value is ActivityEdit =>
        isActivityFields(value) &&
        Predicate.isObject(value) &&
        isActivityFields(value.from),
    },
    equals: sameFields,
    scheduleId,
    saved: { ...fields, from: fields },
    write: 'activity',
    run: async ({ from, ...value }) =>
      timeRefusal(value.time) ??
      answerOwn(
        await edit({
          data: {
            scheduleId,
            activityId: activity.id,
            ...(value.title !== from.title && { title: value.title }),
            ...(value.time !== from.time && {
              time: value.time === '' ? null : value.time,
            }),
            ...(value.note !== from.note && { note: value.note }),
          },
        }),
        activityRefusal,
      ),
  })

  const removing = removal !== undefined
  const removed = removal !== undefined && SaveState.$is('Saved')(removal)

  useEffect(() => {
    if (removed) editing.discard()
  }, [removed])

  const settling =
    moving ||
    (removal !== undefined &&
      (SaveState.$is('Saving')(removal) || SaveState.$is('Saved')(removal)))

  const unmovable = dayOrderUnsettled || settling || removing

  const showing =
    SaveState.$is('Clean')(editing.state) ||
    SaveState.$is('Saved')(editing.state)

  const justSaved =
    SaveState.$is('Saved')(editing.state) ||
    (SaveState.$is('Clean')(editing.state) && editing.state.justSaved)

  const { title, time, note } = editing.value
  const savedEdit = SaveState.$is('Saved')(editing.state)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-3 transition-opacity',
        settling && 'opacity-50',
      )}
    >
      {showing ? (
        <div className="grid grid-cols-[3.25rem_1fr_auto] items-start gap-x-3">
          <p className="pt-px font-heading text-base tabular-nums">
            {time === '' ? (
              <span className="text-muted-foreground">
                <span aria-hidden>—</span>
                <span className="sr-only">No time</span>
              </span>
            ) : (
              <time dateTime={time}>{time}</time>
            )}
          </p>
          <div className="flex min-w-0 flex-col gap-1">
            <p
              id={titleId}
              className="text-base leading-snug font-medium break-words"
            >
              {title}
            </p>
            {note !== '' && (
              <NoteText text={note} className="text-sm text-muted-foreground" />
            )}
            <SavedStatus saved={justSaved}>Saved</SavedStatus>
          </div>
          <div className="-my-1 flex">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move up"
              aria-describedby={titleId}
              disabled={beforeWhenUp === undefined || unmovable}
              onClick={() => {
                if (beforeWhenUp !== undefined) onMove(beforeWhenUp)
              }}
              className="text-muted-foreground"
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move down"
              aria-describedby={titleId}
              disabled={beforeWhenDown === undefined || unmovable}
              onClick={() => {
                if (beforeWhenDown !== undefined) onMove(beforeWhenDown)
              }}
              className="text-muted-foreground"
            >
              <ArrowDownIcon aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit"
              aria-describedby={titleId}
              disabled={settling || removing || savedEdit}
              onClick={editing.edit}
              className="text-muted-foreground"
            >
              <PencilIcon aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <ActivityEditor
          state={editing.state}
          value={editing.value}
          onChange={(next) => editing.change({ ...editing.value, ...next })}
          onSubmit={() => void editing.save()}
          onDiscard={editing.discard}
          verbs={{ submit: 'Save', submitting: 'Saving…' }}
        >
          <Button
            type="button"
            variant="ghost"
            disabled={SaveState.$is('Saving')(editing.state) || removing}
            onClick={onRemove}
            className="ml-auto text-muted-foreground"
          >
            <Trash2Icon data-icon="inline-start" aria-hidden />
            Remove
          </Button>
        </ActivityEditor>
      )}
      {showing && !removing && (
        <PinField
          scheduleId={scheduleId}
          target={{ activityId: activity.id }}
          pin={activity.pin}
          near={near}
          noun="location"
          labelledBy={titleId}
          summaryClassName="pl-16"
        />
      )}
      {alerts}
    </div>
  )
}

interface NewActivity extends ActivityFields {
  readonly operationId: string
  readonly operationScheduleId: string
}

const noNewActivity: NewActivity = {
  title: '',
  time: '',
  note: '',
  operationId: '',
  operationScheduleId: '',
}

const newActivityDraft = (date: IsoDate): DraftKeeping<NewActivity> => ({
  target: newActivityTarget(date),
  isValue: (value): value is NewActivity =>
    isActivityFields(value) &&
    Predicate.isObject(value) &&
    Predicate.isString(value.operationId) &&
    Predicate.isString(value.operationScheduleId),
})

function AddActivityForm({
  scheduleId,
  date,
}: {
  scheduleId: ScheduleId
  date: IsoDate
}) {
  const add = useServerFn(addActivity)

  const field = useOperationSave({
    draft: newActivityDraft(date),
    equals: sameFields,
    scheduleId,
    saved: noNewActivity,
    write: 'activity',
    run: async ({ operationId, title, time, note }) =>
      timeRefusal(time) ??
      answerOwn(
        await add({
          data: {
            operationId,
            scheduleId,
            date,
            title,
            ...(time !== '' && { time }),
            ...(note !== '' && { note }),
          },
        }),
        activityRefusal,
      ),
  })

  const { state, value } = field

  if (SaveState.$is('Clean')(state)) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={field.edit}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          Add an Activity
        </Button>
        <SavedStatus saved={state.justSaved}>Added</SavedStatus>
      </div>
    )
  }

  return (
    <ActivityEditor
      state={state}
      value={value}
      onChange={(next) => field.change({ ...value, ...next })}
      onSubmit={() => void field.save()}
      onDiscard={field.discard}
      verbs={{ submit: 'Add', submitting: 'Adding…' }}
    />
  )
}

const AddActivity = keyedBy(AddActivityForm, ({ date }) => date)

interface ActivityMove {
  readonly activityId: string
  readonly before: string | null
}

function DayActivities({
  scheduleId,
  date,
  activities,
  near,
  labelledBy,
}: {
  scheduleId: ScheduleId
  date: IsoDate
  activities: ReadonlyArray<Activity>
  near: Coordinates
  labelledBy: string
}) {
  const move = useServerFn(moveActivity)

  const remove = useServerFn(removeActivity)

  const moving = useSave<ActivityMove | null>({
    scheduleId,
    saved: null,
    write: 'activity',
    run: async (activityMove) => {
      if (activityMove === null) return SaveAnswer.Saved()

      const outcome = await move({ data: { scheduleId, ...activityMove } })

      return passedActivityGone(activityMove.activityId, outcome)
        ? warned(SaveAnswer.Saved(), notMoved)
        : outcome
    },
  })

  const removal = useSave<string | null>({
    scheduleId,
    saved: null,
    write: 'activity',
    run: async (activityId) =>
      activityId === null
        ? SaveAnswer.Saved()
        : removalAnswerOf(await remove({ data: { scheduleId, activityId } })),
  })

  const dayOrderUnsettled =
    !SaveState.$is('Clean')(moving.state) ||
    !SaveState.$is('Clean')(removal.state)

  const movingId = moving.value?.activityId
  const removingId = removal.value

  useEffect(() => {
    const shown = new Set(activities.map(({ id }) => id))

    const discardIfActivityGone = (
      save: typeof moving | typeof removal,
      activityId: string | null | undefined,
    ) => {
      if (
        SaveState.$is('NotSaved')(save.state) &&
        activityId != null &&
        !shown.has(activityId)
      ) {
        save.discard()
      }
    }

    discardIfActivityGone(moving, movingId)
    discardIfActivityGone(removal, removingId)
  }, [activities, moving.state, removal.state])

  const alertOf = <V,>(
    save: ReturnType<typeof useSave<V>>,
    concerned: boolean,
  ) =>
    concerned &&
    SaveState.$is('NotSaved')(save.state) && (
      <NotSavedAlert problem={save.state.problem}>
        <RetryOrDismiss
          onRetry={() => void save.save()}
          onDismiss={save.discard}
        />
      </NotSavedAlert>
    )

  return (
    <div className="flex flex-col gap-4">
      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing planned yet. Add what you plan to do, with its time in Tokyo
          when it has one.
        </p>
      ) : (
        <ol
          aria-labelledby={labelledBy}
          className="flex flex-col divide-y divide-border border-y border-border"
        >
          {activities.map((activity, index) => (
            <li key={activity.id}>
              <ActivityRow
                activity={activity}
                scheduleId={scheduleId}
                near={near}
                beforeWhenUp={activities[index - 1]?.id}
                beforeWhenDown={
                  index === activities.length - 1
                    ? undefined
                    : (activities[index + 2]?.id ?? null)
                }
                onMove={(before) =>
                  void moving.send({ activityId: activity.id, before })
                }
                onRemove={() => void removal.send(activity.id)}
                dayOrderUnsettled={dayOrderUnsettled}
                moving={
                  movingId === activity.id &&
                  (SaveState.$is('Saving')(moving.state) ||
                    SaveState.$is('Saved')(moving.state))
                }
                removal={removingId === activity.id ? removal.state : undefined}
                alerts={
                  <>
                    {alertOf(moving, movingId === activity.id)}
                    {alertOf(removal, removingId === activity.id)}
                  </>
                }
              />
            </li>
          ))}
        </ol>
      )}
      <AddActivity scheduleId={scheduleId} date={date} />
    </div>
  )
}

export const Activities = keyedBy(DayActivities, ({ date }) => date)
