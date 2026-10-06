import { useServerFn } from '@tanstack/react-start'
import { Match, Predicate } from 'effect'
import { BadgeAlertIcon, BellIcon, Trash2Icon } from 'lucide-react'
import { useId } from 'react'

import { ButtonLink } from '@/components/button-link'
import {
  NotSavedAlert,
  RetryOrDismiss,
  SavedStatus,
} from '@/components/not-saved-alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Item } from '@/components/ui/item'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  formatDay,
  formatNights,
  formatShortDate,
  formatWeekday,
} from '@/trip/calendar'
import type {
  AddOwnChecklistItemOutcome,
  ChecklistItem,
  ChecklistMove,
  ScheduleId,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
} from '@/trip/domain'
import {
  newChecklistItemTarget,
  SaveAnswer,
  SaveState,
  useSave,
} from '@/trip/drafts'
import type { DraftKeeping } from '@/trip/drafts'
import { reminderDateOf } from '@/trip/checklist-items'
import { checklistTextMaxLength } from '@/trip/limits'
import {
  addOwnChecklistItem,
  removeOwnChecklistItem,
  tickChecklistItem,
  tickOwnChecklistItem,
} from '@/trip/trip.functions'

/** A date as "Fri Dec 11". */
const formatWeekdayDate = (date: string) =>
  `${formatWeekday(date)} ${formatShortDate(date)}`

const moveRoute = ({ from, to }: ChecklistMove) =>
  `${from.romaji} → ${to.romaji}`

/** What an item asks for, and what it's about, in glossary terms. */
const wordingOf = (
  item: ChecklistItem,
): { readonly title: string; readonly about?: string } =>
  Match.value(item).pipe(
    Match.tagsExhaustive({
      BookHotel: ({ stay }) => ({
        title: `Book hotel in ${stay.base.romaji}`,
        about: `${formatShortDate(stay.checkIn)} – ${formatShortDate(stay.checkOut)} · ${formatNights(stay.nights)}`,
      }),
      ReserveSeats: ({ move }) => ({
        title: `Reserve seats, ${moveRoute(move)}`,
        about: `Move on ${formatDay(move.date)}`,
      }),
      BookFlight: ({ move }) => ({
        title: `Book flight, ${moveRoute(move)}`,
        about: `Move on ${formatDay(move.date)}`,
      }),
      ConfirmShigeharu: ({ date }) => ({
        title: `Confirm Shigeharu is open ${formatWeekdayDate(date)}`,
      }),
      ReserveBirthdayDinner: ({ date }) => ({
        title: 'Reserve birthday dinner',
        about: formatDay(date),
      }),
      VerifyClaim: ({ text, attachedTo }) => ({
        title: text,
        about: Match.value(attachedTo).pipe(
          Match.tagsExhaustive({
            Day: ({ date }) => formatDay(date),
            Stay: ({ checkIn }) => `The Stay from ${formatShortDate(checkIn)}`,
            Itinerary: () => 'The whole Schedule',
          }),
        ),
      }),
      Own: ({ text }) => ({ title: text }),
    }),
  )

const verifyNotes = {
  'reminder-date': 'Verify: seats open about a month before',
  'when-booking-opens': 'Verify when booking opens',
}

/** What, if anything, an item says to verify, beside its reminder date. */
const verifyNoteOf = (item: ChecklistItem) =>
  Match.value(item).pipe(
    Match.tags({
      ReserveSeats: ({ verify }) => verifyNotes[verify],
      BookFlight: ({ verify }) => verifyNotes[verify],
      VerifyClaim: () => 'Verify',
    }),
    Match.orElse(() => undefined),
  )

const notFound = SaveAnswer.Gone({
  problem: 'This item is no longer on your Checklist.',
})

const tickAnswerOf = (outcome: TickChecklistItemOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Ticked: () => SaveAnswer.Saved(),
      ScheduleChanged: () => {
        // Its row goes once the new Schedule's items are read, so say so
        // where it outlives the row.
        toast.add({
          type: 'warning',
          title: 'Your Schedule changed on another device',
          description:
            'The tick wasn’t saved. The Checklist now shows the Schedule as it is.',
        })

        return SaveAnswer.ScheduleChanged()
      },
      ChecklistItemNotFound: () => notFound,
    }),
  )

const ownTickAnswerOf = (outcome: TickOwnChecklistItemOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Ticked: () => SaveAnswer.Saved(),
      ChecklistItemNotFound: () => notFound,
    }),
  )

/**
 * One Checklist item: its tick, what it asks for and when, and for Phillip's
 * own, a way to remove it. A tick is sent at once, as the value it sets.
 */
function ChecklistRow({
  item,
  scheduleId,
}: {
  item: ChecklistItem
  /** The Schedule its derived items came from; null before one is chosen. */
  scheduleId: ScheduleId | null
}) {
  const titleId = useId()
  const own = Predicate.isTagged('Own')(item)
  const tickDerived = useServerFn(tickChecklistItem)
  const tickOwn = useServerFn(tickOwnChecklistItem)
  const remove = useServerFn(removeOwnChecklistItem)

  const tick = useSave({
    // Own items belong to the Trip, so a Schedule change never refuses them.
    scheduleId: own ? null : scheduleId,
    saved: item.ticked,
    write: 'checklist',
    run: async (ticked) => {
      if (own) {
        return ownTickAnswerOf(
          await tickOwn({ data: { itemId: item.id, ticked } }),
        )
      }

      if (scheduleId === null) return SaveAnswer.ScheduleChanged()

      return tickAnswerOf(
        await tickDerived({ data: { scheduleId, itemId: item.id, ticked } }),
      )
    },
  })

  // Removed is the value removing saves: once saved, the item is gone.
  const removal = useSave({
    scheduleId: null,
    saved: false,
    write: 'checklist',
    run: async () => {
      await remove({ data: { itemId: item.id } })

      return SaveAnswer.Saved()
    },
  })

  const ticked = tick.value
  const removing = !SaveState.$is('Clean')(removal.state)
  const { title, about } = wordingOf(item)
  const verifyNote = verifyNoteOf(item)
  const reminderDate = reminderDateOf(item)

  return (
    <Item
      variant="outline"
      size="sm"
      className={cn(
        'items-start transition-opacity',
        (SaveState.$is('Saving')(removal.state) ||
          SaveState.$is('Saved')(removal.state)) &&
          'opacity-50',
      )}
    >
      <Checkbox
        aria-labelledby={titleId}
        checked={ticked}
        // A save in flight fixes the tick, so two saves never race.
        readOnly={SaveState.$is('Saving')(tick.state)}
        disabled={removing && !SaveState.$is('NotSaved')(removal.state)}
        onCheckedChange={(checked) => void tick.send(checked)}
        className="mt-0.5 size-5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          id={titleId}
          className={cn(
            'text-sm leading-snug font-medium',
            ticked && 'text-muted-foreground line-through',
          )}
        >
          {title}
        </p>
        {(about !== undefined ||
          reminderDate !== undefined ||
          verifyNote !== undefined) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {about !== undefined && <span>{about}</span>}
            {reminderDate !== undefined && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <BellIcon aria-hidden className="size-3.5" />
                <span className="sr-only">Reminder date: </span>
                <time dateTime={reminderDate}>
                  {formatWeekdayDate(reminderDate)}
                </time>
              </span>
            )}
            {verifyNote !== undefined && (
              <Badge
                variant="outline"
                className="h-auto min-h-5 whitespace-normal"
              >
                <BadgeAlertIcon data-icon="inline-start" aria-hidden />
                {verifyNote}
              </Badge>
            )}
          </div>
        )}
        {SaveState.$is('NotSaved')(tick.state) && (
          <NotSavedAlert problem={tick.state.problem}>
            <RetryOrDismiss
              onRetry={() => void tick.save()}
              onDismiss={tick.discard}
            />
          </NotSavedAlert>
        )}
        {SaveState.$is('NotSaved')(removal.state) && (
          <NotSavedAlert problem={removal.state.problem}>
            <RetryOrDismiss
              onRetry={() => void removal.save()}
              onDismiss={removal.discard}
            />
          </NotSavedAlert>
        )}
      </div>
      {own && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove"
          aria-describedby={titleId}
          disabled={removing}
          onClick={() => void removal.send(true)}
          className="-my-1 text-muted-foreground"
        >
          <Trash2Icon aria-hidden />
        </Button>
      )}
    </Item>
  )
}

/** The Checklist's items, the next thing to do on top. */
export function ChecklistItems({
  items,
  scheduleId,
}: {
  items: ReadonlyArray<ChecklistItem>
  scheduleId: ScheduleId | null
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on your Checklist yet.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={`${item._tag} ${item.id}`}>
          <ChecklistRow item={item} scheduleId={scheduleId} />
        </li>
      ))}
    </ul>
  )
}

/**
 * A new own Checklist item as typed: its text, its reminder date or '' for
 * none, and the operation id its save carries. Any change takes a fresh
 * operation id; a retry of the same item keeps it, so a save whose answer
 * was lost is never added twice.
 */
interface NewChecklistItem {
  readonly text: string
  readonly reminderDate: string
  readonly operationId: string
}

const noNewItem: NewChecklistItem = {
  text: '',
  reminderDate: '',
  operationId: '',
}

const newItemDraft: DraftKeeping<NewChecklistItem> = {
  target: newChecklistItemTarget,
  isValue: (value): value is NewChecklistItem =>
    Predicate.isObject(value) &&
    Predicate.isString(value.text) &&
    Predicate.isString(value.reminderDate) &&
    Predicate.isString(value.operationId),
}

const addAnswerOf = (outcome: AddOwnChecklistItemOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Added: () => SaveAnswer.Saved(),
      ChecklistTextInvalid: ({ maxLength }) =>
        SaveAnswer.Refused({
          problem: `An item needs some text, at most ${maxLength} characters.`,
        }),
    }),
  )

/** Adds one of Phillip's own Checklist items, kept as a draft until saved. */
export function AddChecklistItem({ labelledBy }: { labelledBy: string }) {
  const add = useServerFn(addOwnChecklistItem)
  const dateId = useId()
  const problemId = useId()

  const field = useSave({
    draft: newItemDraft,
    equals: (a, b) => a.text === b.text && a.reminderDate === b.reminderDate,
    scheduleId: null,
    saved: noNewItem,
    write: 'checklist',
    run: async ({ text, reminderDate, operationId }) =>
      reminderDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(reminderDate)
        ? SaveAnswer.Refused({
            problem: 'Choose a reminder date with a four-digit year.',
          })
        : addAnswerOf(
            await add({
              data: {
                operationId,
                text,
                ...(reminderDate !== '' && { reminderDate }),
              },
            }),
          ),
  })

  const { state, value } = field
  const saving = SaveState.$is('Saving')(state)
  const notSaved = SaveState.$is('NotSaved')(state)
  // A saved item shows in the list once read; until then its text stays.
  const settling = saving || SaveState.$is('Saved')(state)

  const change = (next: Partial<NewChecklistItem>) =>
    field.change({ ...value, ...next, operationId: crypto.randomUUID() })

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          aria-labelledby={labelledBy}
          aria-describedby={notSaved ? problemId : undefined}
          placeholder="Something to book or confirm"
          value={value.text}
          onChange={(event) => change({ text: event.target.value })}
          readOnly={settling}
          required
          maxLength={checklistTextMaxLength}
          className="h-10 sm:flex-1"
        />
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor={dateId} className="text-sm text-muted-foreground">
            Reminder date (optional)
          </label>
          <Input
            id={dateId}
            type="date"
            value={value.reminderDate}
            onChange={(event) => change({ reminderDate: event.target.value })}
            readOnly={settling}
            className="h-10"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={settling || value.text.trim() === ''}>
          {saving ? 'Adding…' : notSaved ? 'Retry' : 'Add'}
        </Button>
        {(notSaved || SaveState.$is('Editing')(state)) && (
          <Button type="button" variant="ghost" onClick={field.discard}>
            {notSaved ? 'Discard' : 'Clear'}
          </Button>
        )}
        <SavedStatus saved={SaveState.$is('Clean')(state) && state.justSaved}>
          Added
        </SavedStatus>
      </div>
    </form>
  )
}

/** Before a Schedule exists: the prompt to choose an Itinerary. */
export function ChooseItineraryPrompt() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-border bg-secondary px-4 py-4 text-sm text-secondary-foreground">
      <p>
        No Schedule yet. Choose an Itinerary, and the hotels, seats, flights and
        confirmations it needs appear here. Your own items stay as they are.
      </p>
      <ButtonLink to="/options" size="sm">
        Compare the Itineraries
      </ButtonLink>
    </div>
  )
}
