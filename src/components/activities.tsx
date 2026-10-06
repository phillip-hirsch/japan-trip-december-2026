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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatDay, timeOfDayOf, timeOfDayPattern } from '@/trip/calendar'
import type {
  Activity,
  AddActivityOutcome,
  EditActivityOutcome,
  IsoDate,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  ScheduleId,
} from '@/trip/domain'
import {
  activityTarget,
  newActivityTarget,
  SaveAnswer,
  SaveState,
  useSave,
} from '@/trip/drafts'
import type { DraftKeeping } from '@/trip/drafts'
import { activityTitleMaxLength, noteMaxLength } from '@/trip/limits'
import {
  addActivity,
  editActivity,
  moveActivity,
  removeActivity,
} from '@/trip/trip.functions'

/**
 * An Activity as typed: its title, its Tokyo time of day as HH:MM or '' for
 * none, and its note or '' for none.
 */
interface ActivityFields {
  readonly title: string
  readonly time: string
  readonly note: string
}

const sameFields = (a: ActivityFields, b: ActivityFields) =>
  a.title === b.title && a.time === b.time && a.note === b.note

/** Whether a stored draft holds an Activity's fields. */
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

/** A time field holds HH:MM, or nothing for an Activity without a time. */
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

const addAnswerOf = (outcome: AddActivityOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Added: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      DayNotFound: ({ date }) =>
        SaveAnswer.Refused({
          problem: `${formatDay(date)} is no longer a Day of your Schedule. Your Activity is kept here.`,
        }),
      ActivityTitleInvalid: ({ maxLength }) => titleInvalid(maxLength),
      NoteTooLong: ({ maxLength }) => noteTooLong(maxLength),
    }),
  )

const editAnswerOf = (outcome: EditActivityOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Edited: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      // Removed, perhaps on another device: the refetch takes its row away.
      ActivityNotFound: () =>
        SaveAnswer.Gone({
          problem:
            'This Activity is no longer on this Day, perhaps removed on another device.',
        }),
      ActivityTitleInvalid: ({ maxLength }) => titleInvalid(maxLength),
      NoteTooLong: ({ maxLength }) => noteTooLong(maxLength),
    }),
  )

const removeAnswerOf = (outcome: RemoveActivityOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Removed: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      // Already gone, such as by a removal whose answer was lost: what
      // removing asked for.
      ActivityNotFound: () => SaveAnswer.Saved(),
    }),
  )

/** What moving an Activity answered, by the id of the one moving. */
const moveAnswerOf =
  (moving: string) =>
  (outcome: MoveActivityOutcome): SaveAnswer =>
    Match.value(outcome).pipe(
      Match.tagsExhaustive({
        Moved: () => SaveAnswer.Saved(),
        ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
        ActivityNotFound: ({ activityId }) => {
          if (activityId === moving) {
            return SaveAnswer.Gone({
              problem: 'This Activity is no longer on this Day.',
            })
          }

          // Its neighbour is gone, so retrying the same move never could
          // land: settle it, and say so where it outlives the refetch.
          toast.add({
            type: 'warning',
            title: 'The Activity wasn’t moved',
            description:
              'The one it was moving past was removed, perhaps on another device. Move it again if you still want to.',
          })

          return SaveAnswer.Saved()
        },
      }),
    )

/**
 * The fields of an Activity being added or edited, with what saves it and
 * any other actions. A save in flight fixes the fields, so two saves never
 * race.
 */
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
  /** What the submit button says, before and while saving. */
  verbs: { readonly submit: string; readonly submitting: string }
  /** Other actions, after Save and Cancel. */
  children?: ReactNode
}) {
  const titleId = useId()
  const timeId = useId()
  const noteId = useId()
  const problemId = useId()
  const saving = SaveState.$is('Saving')(state)
  const notSaved = SaveState.$is('NotSaved')(state)
  // A saved Activity shows in the list once read; until then its fields stay.
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

/**
 * An edit to an Activity as typed, with its fields as they were when the
 * edit began: only those changed since are sent, so a change another device
 * makes to the rest meanwhile still stands.
 */
interface ActivityEdit extends ActivityFields {
  readonly from: ActivityFields
}

/**
 * One Activity: its Tokyo time, title and note, with controls to move it up
 * or down its Day and to edit or remove it. Edits are kept as a draft until
 * saved; a move or removal is sent at once.
 */
function ActivityRow({
  activity,
  scheduleId,
  beforeWhenUp,
  beforeWhenDown,
  onMove,
  onRemove,
  reordering,
  moving,
  removal,
  alerts,
}: {
  activity: Activity
  scheduleId: ScheduleId
  /**
   * The id of the Activity moving it up places it before; undefined for the
   * first, which can't move up.
   */
  beforeWhenUp: string | undefined
  /**
   * The id of the Activity moving it down places it before, or null to place
   * it last; undefined for the last, which can't move down.
   */
  beforeWhenDown: string | null | undefined
  /** Moves it before the Activity with an id, or last for null. */
  onMove: (before: string | null) => void
  /** Removes it. */
  onRemove: () => void
  /**
   * Whether a move or removal on its Day is unsettled: not yet confirmed by
   * a read, or not saved. Until it settles, the order shown may be out of
   * date, so no move is sent from it.
   */
  reordering: boolean
  /** Whether this Activity's move awaits the read that confirms it. */
  moving: boolean
  /** Removing this Activity, if it is being removed. */
  removal: SaveState<string | null> | undefined
  /** Why this Activity's last move or removal wasn't saved, with Retry. */
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
      editAnswerOf(
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
      ),
  })

  const removing = removal !== undefined
  const removed = removal !== undefined && SaveState.$is('Saved')(removal)

  // Once the Activity is removed, so is any edit to it.
  useEffect(() => {
    if (removed) editing.discard()
  }, [removed])

  // A move or removal holds the row until the read that confirms it.
  const settling =
    moving ||
    (removal !== undefined &&
      (SaveState.$is('Saving')(removal) || SaveState.$is('Saved')(removal)))

  const unmovable = reordering || settling || removing

  const showing =
    SaveState.$is('Clean')(editing.state) ||
    SaveState.$is('Saved')(editing.state)

  const justSaved =
    SaveState.$is('Saved')(editing.state) ||
    (SaveState.$is('Clean')(editing.state) && editing.state.justSaved)

  // What the row shows: the value just saved until a read confirms it,
  // then what the server holds.
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
              // A new edit starts from the value the confirming read brings.
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
      {alerts}
    </div>
  )
}

/**
 * A new Activity as typed, with the operation id its save carries and the
 * Schedule that id was made for. Any change takes a fresh operation id; a
 * retry of the same Activity on the same Schedule keeps it, so a save whose
 * answer was lost is never added twice.
 */
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

/** Adds an Activity on a Day, kept as a draft until saved. Key it by date. */
function AddActivity({
  scheduleId,
  date,
}: {
  scheduleId: ScheduleId
  date: IsoDate
}) {
  const add = useServerFn(addActivity)

  const field = useSave({
    draft: newActivityDraft(date),
    equals: sameFields,
    scheduleId,
    saved: noNewActivity,
    write: 'activity',
    run: async ({ operationId, title, time, note }) =>
      timeRefusal(time) ??
      addAnswerOf(
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
      ),
  })

  const { state, value } = field

  // A draft kept across a Schedule change takes a fresh operation id: its
  // own may already be recorded with an Activity added to the Schedule it
  // was made for, which a retry here would answer with instead of adding.
  useEffect(() => {
    if (
      SaveState.$is('NotSaved')(state) &&
      value.operationScheduleId !== scheduleId
    ) {
      field.change({
        ...value,
        operationId: crypto.randomUUID(),
        operationScheduleId: scheduleId,
      })
    }
  }, [state, scheduleId])

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
      onChange={(next) =>
        field.change({
          ...value,
          ...next,
          operationId: crypto.randomUUID(),
          operationScheduleId: scheduleId,
        })
      }
      onSubmit={() => void field.save()}
      onDiscard={field.discard}
      verbs={{ submit: 'Add', submitting: 'Adding…' }}
    />
  )
}

/** Moving an Activity before another on its Day, or last for null. */
interface ActivityMove {
  readonly activityId: string
  readonly before: string | null
}

/**
 * A Day's Activities in the order Phillip keeps them, never re-sorted by
 * time, and a way to add one. Key it by the Day's date.
 */
export function Activities({
  scheduleId,
  date,
  activities,
  labelledBy,
}: {
  scheduleId: ScheduleId
  date: IsoDate
  activities: ReadonlyArray<Activity>
  /** The id of the heading naming the Activities. */
  labelledBy: string
}) {
  const move = useServerFn(moveActivity)

  const remove = useServerFn(removeActivity)

  // One move or removal at a time on the Day: until the read that confirms
  // it, or while it isn't saved, every row's neighbours may be out of date,
  // so no move is sent from them.
  const moving = useSave<ActivityMove | null>({
    scheduleId,
    saved: null,
    write: 'activity',
    run: async (activityMove) =>
      activityMove === null
        ? SaveAnswer.Saved()
        : moveAnswerOf(activityMove.activityId)(
            await move({ data: { scheduleId, ...activityMove } }),
          ),
  })

  // The id of the Activity removing it saves; once saved, it is gone.
  const removal = useSave<string | null>({
    scheduleId,
    saved: null,
    write: 'activity',
    run: async (activityId) =>
      activityId === null
        ? SaveAnswer.Saved()
        : removeAnswerOf(await remove({ data: { scheduleId, activityId } })),
  })

  const reordering =
    !SaveState.$is('Clean')(moving.state) ||
    !SaveState.$is('Clean')(removal.state)

  const movingId = moving.value?.activityId
  const removingId = removal.value

  // A move or removal not saved whose Activity is no longer shown, such as
  // one removed on another device or left behind by a Schedule change, has
  // nothing left to retry and no row to say so: let it go, so the rest can
  // move again.
  useEffect(() => {
    const shown = new Set(activities.map(({ id }) => id))

    for (const [save, activityId] of [
      [moving, movingId],
      [removal, removingId],
    ] as const) {
      if (
        SaveState.$is('NotSaved')(save.state) &&
        activityId != null &&
        !shown.has(activityId)
      ) {
        save.discard()
      }
    }
  }, [activities, moving.state, removal.state])

  /** Why a move or removal of an Activity wasn't saved, with Retry. */
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
                reordering={reordering}
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
      <AddActivity key={date} scheduleId={scheduleId} date={date} />
    </div>
  )
}
