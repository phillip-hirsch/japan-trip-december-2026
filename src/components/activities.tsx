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
  addVerb,
  EditorFrame,
  frameOf,
  saveVerb,
  SendNotSaved,
} from '@/components/editor-frame'
import type { EditorFrameView } from '@/components/editor-frame'
import { SavedStatus } from '@/components/not-saved-alert'
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
  activityMovesTarget,
  activityRemovalsTarget,
  activityTarget,
  answerOwn,
  newActivityTarget,
  SaveAnswer,
  SaveState,
  useSave,
  useSend,
  warned,
} from '@/trip/client/drafts'
import type { OwnOutcome, SaveWarning } from '@/trip/client/drafts'
import { activityTitleMaxLength, noteMaxLength } from '@/trip/domain/limits'
import {
  addActivity,
  editActivity,
  moveActivity,
  removeActivity,
} from '@/trip/trip/trip.functions'

/** An Activity's fields as its editor holds them; an empty time is none. */
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

/** An edit of an Activity, with the fields it was made from. */
interface ActivityEdit extends ActivityFields {
  readonly from: ActivityFields
}

/**
 * An edit of an Activity of the Schedule shown, kept as a Draft. It sends
 * only the fields changed, so the last write wins for each. An edit opened
 * on a value just saved starts from what was sent, not from the Activity as
 * last read, so changing a field back still sends it.
 */
export const useActivityEdit = ({
  scheduleId,
  activity,
}: {
  scheduleId: ScheduleId
  activity: Activity
}) => {
  const edit = useServerFn(editActivity)
  const fields = fieldsOf(activity)

  const field = useSave<ActivityEdit>({
    target: activityTarget(activity.id),
    draft: (value): value is ActivityEdit =>
      isActivityFields(value) &&
      Predicate.isObject(value) &&
      isActivityFields(value.from),
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

  const editAgain = () => {
    if (!SaveState.$is('Saved')(field.state)) return field.edit()

    const { title, time, note } = field.value
    const sent = { title, time, note }
    field.change({ ...sent, from: sent })
  }

  return { ...field, edit: editAgain }
}

const noNewActivity: ActivityFields = { title: '', time: '', note: '' }

/**
 * A new Activity on a Day of the Schedule shown, kept as a Draft, and added
 * once under its operation however often it is retried.
 */
export const useNewActivity = ({
  scheduleId,
  date,
}: {
  scheduleId: ScheduleId
  date: IsoDate
}) => {
  const add = useServerFn(addActivity)

  return useSave({
    target: newActivityTarget(date),
    draft: isActivityFields,
    equals: sameFields,
    scheduleId,
    saved: noNewActivity,
    write: 'activity',
    run: async ({ title, time, note }, operationId) =>
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
}

/** Moving an Activity to just before another on its Day, or after the rest. */
interface ActivityMove {
  readonly activityId: string
  readonly before: string | null
}

const notMoved: SaveWarning = {
  title: 'The Activity wasn’t moved',
  description:
    'The one it was moving past was removed, perhaps on another device. Move it again if you still want to.',
}

/** The Activity a move was to pass is gone, so nothing moved. */
const passedActivityGone = (moving: string, outcome: MoveActivityOutcome) =>
  Predicate.isTagged('ActivityNotFound')(outcome) &&
  outcome.activityId !== moving

/** The Activities on a Day of the Schedule shown, as last read. */
interface DayShown {
  readonly scheduleId: ScheduleId
  readonly date: IsoDate
  readonly activities: ReadonlyArray<Activity>
}

const isShown = (activities: ReadonlyArray<Activity>, activityId: string) =>
  activities.some(({ id }) => id === activityId)

/**
 * Moves of the Activities on a Day of the Schedule shown, one at a time.
 * A move past an Activity that is gone counts as saved, with a warning; a
 * move not saved of one since gone is dropped.
 */
export const useActivityMove = ({ scheduleId, date, activities }: DayShown) => {
  const move = useServerFn(moveActivity)

  return useSend<ActivityMove>({
    target: activityMovesTarget(date),
    moot: ({ activityId }) => !isShown(activities, activityId),
    scheduleId,
    write: 'activity',
    run: async (activityMove) => {
      const outcome = await move({ data: { scheduleId, ...activityMove } })

      return passedActivityGone(activityMove.activityId, outcome)
        ? warned(SaveAnswer.Saved(), notMoved)
        : outcome
    },
  })
}

/** Removing an Activity already gone counts as saved. */
const removalAnswerOf = (outcome: RemoveActivityOutcome) =>
  Predicate.isTagged('ActivityNotFound')(outcome) ? SaveAnswer.Saved() : outcome

/**
 * Removals of the Activities on a Day of the Schedule shown, by id, one at a
 * time. Removing one already gone counts as saved, and a removal not saved
 * of one since gone is dropped.
 */
export const useActivityRemoval = ({
  scheduleId,
  date,
  activities,
}: DayShown) => {
  const remove = useServerFn(removeActivity)

  return useSend<string>({
    target: activityRemovalsTarget(date),
    moot: (activityId) => !isShown(activities, activityId),
    scheduleId,
    write: 'activity',
    run: async (activityId) =>
      removalAnswerOf(await remove({ data: { scheduleId, activityId } })),
  })
}

function ActivityInputs({
  frame,
  value,
  onChange,
}: {
  frame: EditorFrameView
  value: ActivityFields
  onChange: (next: Partial<ActivityFields>) => void
}) {
  const titleId = useId()
  const timeId = useId()
  const noteId = useId()

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1.5 sm:flex-1">
          <label htmlFor={titleId} className="text-sm text-muted-foreground">
            Title
          </label>
          <Input
            id={titleId}
            aria-describedby={frame.describedBy}
            autoFocus={frame.autoFocus}
            value={value.title}
            onChange={(event) => onChange({ title: event.target.value })}
            readOnly={frame.busy}
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
            readOnly={frame.busy}
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
          readOnly={frame.busy}
          maxLength={noteMaxLength}
          rows={3}
          className="min-h-20 text-base md:text-base"
        />
      </div>
    </>
  )
}

function ActivityRow({
  activity,
  scheduleId,
  near,
  beforeWhenUp,
  beforeWhenDown,
  onMove,
  onRemove,
  unmovable,
  settling,
  removing,
  removed,
  alerts,
}: {
  activity: Activity
  scheduleId: ScheduleId
  near: Coordinates
  beforeWhenUp: string | undefined
  beforeWhenDown: string | null | undefined
  onMove: (before: string | null) => void
  onRemove: () => void
  /** A move or removal on its Day is still open. */
  unmovable: boolean
  /** Its own move or removal is on its way, or saved but not yet shown. */
  settling: boolean
  /** Its removal is open. */
  removing: boolean
  /** Its removal is saved. */
  removed: boolean
  alerts: ReactNode
}) {
  const titleId = useId()
  const editing = useActivityEdit({ scheduleId, activity })

  useEffect(() => {
    if (removed) editing.discard()
  }, [removed])

  const orderLocked = unmovable || settling || removing
  const { title, time, note } = editing.value

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-3 transition-opacity',
        settling && 'opacity-50',
      )}
    >
      <EditorFrame
        field={editing}
        labelledBy={titleId}
        nameForm={false}
        ready={title.trim() !== ''}
        summaryView={(frame) => (
          <>
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
                  <NoteText
                    text={note}
                    className="text-sm text-muted-foreground"
                  />
                )}
                <SavedStatus saved={frame.justSaved}>
                  {saveVerb.done}
                </SavedStatus>
              </div>
              <div className="-my-1 flex">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  aria-describedby={titleId}
                  disabled={beforeWhenUp === undefined || orderLocked}
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
                  disabled={beforeWhenDown === undefined || orderLocked}
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
                  disabled={frame.busy || settling || removing}
                  onClick={editing.edit}
                  className="text-muted-foreground"
                >
                  <PencilIcon aria-hidden />
                </Button>
              </div>
            </div>
            {!removing && (
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
          </>
        )}
        actions={(frame) => (
          <Button
            type="button"
            variant="ghost"
            disabled={frame.busy || removing}
            onClick={onRemove}
            className="ml-auto text-muted-foreground"
          >
            <Trash2Icon data-icon="inline-start" aria-hidden />
            Remove
          </Button>
        )}
      >
        {(frame) => (
          <ActivityInputs
            frame={frame}
            value={editing.value}
            onChange={(next) => editing.change({ ...editing.value, ...next })}
          />
        )}
      </EditorFrame>
      {alerts}
    </div>
  )
}

function AddActivity({
  scheduleId,
  date,
  labelledBy,
}: {
  scheduleId: ScheduleId
  date: IsoDate
  labelledBy: string
}) {
  const field = useNewActivity({ scheduleId, date })
  const { value } = field

  return (
    <EditorFrame
      field={field}
      labelledBy={labelledBy}
      verb={addVerb}
      form="untilShown"
      nameForm={false}
      ready={value.title.trim() !== ''}
      edits={[
        { label: 'Add an Activity', icon: PlusIcon, onClick: field.edit },
      ]}
    >
      {(frame) => (
        <ActivityInputs
          frame={frame}
          value={value}
          onChange={(next) => field.change({ ...value, ...next })}
        />
      )}
    </EditorFrame>
  )
}

export function Activities({
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
  const moving = useActivityMove({ scheduleId, date, activities })
  const removal = useActivityRemoval({ scheduleId, date, activities })
  const moveFrame = frameOf(moving)
  const removalFrame = frameOf(removal)

  const dayOrderUnsettled =
    !SaveState.$is('Clean')(moving.state) ||
    !SaveState.$is('Clean')(removal.state)

  const movingId = moving.sending?.activityId
  const removingId = removal.sending

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
          {activities.map((activity, index) => {
            const isMoveTarget = movingId === activity.id
            const isRemovalTarget = removingId === activity.id

            return (
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
                  unmovable={dayOrderUnsettled}
                  settling={
                    (isMoveTarget && (moveFrame.busy || moveFrame.justSaved)) ||
                    (isRemovalTarget &&
                      (removalFrame.busy || removalFrame.justSaved))
                  }
                  removing={isRemovalTarget}
                  removed={isRemovalTarget && removalFrame.justSaved}
                  alerts={
                    <>
                      {isMoveTarget && <SendNotSaved field={moving} />}
                      {isRemovalTarget && <SendNotSaved field={removal} />}
                    </>
                  }
                />
              </li>
            )
          })}
        </ol>
      )}
      <AddActivity
        scheduleId={scheduleId}
        date={date}
        labelledBy={labelledBy}
      />
    </div>
  )
}
