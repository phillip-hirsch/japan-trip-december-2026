import { useServerFn } from '@tanstack/react-start'
import { Match, Predicate } from 'effect'
import { BadgeAlertIcon, BellIcon, Trash2Icon } from 'lucide-react'
import { useId } from 'react'

import { ButtonLink } from '@/components/button-link'
import {
  addVerb,
  EditorFrame,
  frameOf,
  SendNotSaved,
} from '@/components/editor-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Item } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import {
  formatDay,
  formatNights,
  formatShortDate,
  formatWeekday,
} from '@/trip/domain/calendar'
import type {
  ChecklistItem,
  ChecklistMove,
  ScheduleId,
} from '@/trip/domain/domain'
import {
  answerOwn,
  checklistItemRemovalTarget,
  newChecklistItemTarget,
  SaveAnswer,
  SaveState,
  tickTarget,
  useSave,
  useSend,
  warned,
} from '@/trip/client/drafts'
import type { SaveWarning } from '@/trip/client/drafts'
import { reminderDateOf } from '@/trip/domain/checklist-items'
import { checklistTextMaxLength } from '@/trip/domain/limits'
import {
  addOwnChecklistItem,
  removeOwnChecklistItem,
  tickChecklistItem,
  tickOwnChecklistItem,
} from '@/trip/trip/trip.functions'

const formatWeekdayDate = (date: string) =>
  `${formatWeekday(date)} ${formatShortDate(date)}`

const moveRoute = ({ from, to }: ChecklistMove) =>
  `${from.romaji} → ${to.romaji}`

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

const verifyNoteOf = (item: ChecklistItem) =>
  Match.value(item).pipe(
    Match.tags({
      ReserveSeats: ({ verify }) => verifyNotes[verify],
      BookFlight: ({ verify }) => verifyNotes[verify],
      VerifyClaim: () => 'Verify',
    }),
    Match.orElse(() => undefined),
  )

const tickScheduleChanged: SaveWarning = {
  title: 'Your Schedule changed on another device',
  description:
    'The tick wasn’t saved. The Checklist now shows the Schedule as it is.',
}

/**
 * The Tick on `item`, of a Checklist showing the Schedule `scheduleId`, or
 * none yet. An own item belongs to the Trip, so its Tick names no Schedule.
 * The hook drops a Tick not saved once the Checklist shows it.
 */
export const useTick = ({
  item,
  scheduleId,
}: {
  item: ChecklistItem
  scheduleId: ScheduleId | null
}) => {
  const own = Predicate.isTagged('Own')(item)
  const tickDerived = useServerFn(tickChecklistItem)
  const tickOwn = useServerFn(tickOwnChecklistItem)

  return useSend<boolean>({
    target: tickTarget(item),
    moot: (ticked) => ticked === item.ticked,
    // Own items belong to the Trip, so a Schedule change never refuses them.
    scheduleId: own ? null : scheduleId,
    write: 'checklist',
    run: async (ticked) => {
      if (own) return tickOwn({ data: { itemId: item.id, ticked } })

      if (scheduleId === null) return SaveAnswer.ScheduleChanged()

      const outcome = await tickDerived({
        data: { scheduleId, itemId: item.id, ticked },
      })

      return warned(
        outcome,
        Predicate.isTagged('ScheduleChanged')(outcome)
          ? tickScheduleChanged
          : undefined,
      )
    },
  })
}

/** Removing one of Phillip's own Checklist items, sent as its id. */
export const useChecklistItemRemoval = ({ itemId }: { itemId: string }) => {
  const remove = useServerFn(removeOwnChecklistItem)

  return useSend<string>({
    target: checklistItemRemovalTarget(itemId),
    scheduleId: null,
    write: 'checklist',
    run: (removing) => remove({ data: { itemId: removing } }),
  })
}

function ChecklistRow({
  item,
  scheduleId,
}: {
  item: ChecklistItem
  scheduleId: ScheduleId | null
}) {
  const titleId = useId()
  const tick = useTick({ item, scheduleId })
  const removal = useChecklistItemRemoval({ itemId: item.id })
  const tickFrame = frameOf(tick)
  const removalFrame = frameOf(removal)

  const ticked = tick.sent ?? item.ticked
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
        removalFrame.busy && 'opacity-50',
      )}
    >
      <Checkbox
        aria-labelledby={titleId}
        checked={ticked}
        readOnly={tickFrame.busy}
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
        <SendNotSaved field={tick} />
        <SendNotSaved field={removal} />
      </div>
      {Predicate.isTagged('Own')(item) && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove"
          aria-describedby={titleId}
          disabled={removing}
          onClick={() => void removal.send(item.id)}
          className="-my-1 text-muted-foreground"
        >
          <Trash2Icon aria-hidden />
        </Button>
      )}
    </Item>
  )
}

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

interface NewChecklistItem {
  readonly text: string
  readonly reminderDate: string
}

const noNewItem: NewChecklistItem = { text: '', reminderDate: '' }

const isNewItem = (value: unknown): value is NewChecklistItem =>
  Predicate.isObject(value) &&
  Predicate.isString(value.text) &&
  Predicate.isString(value.reminderDate)

const textInvalid = ({ maxLength }: { readonly maxLength: number }) =>
  SaveAnswer.Refused({
    problem: `An item needs some text, at most ${maxLength} characters.`,
  })

/**
 * A new own Checklist item, kept as a Draft. Every retry goes under one
 * operation, so the Trip adds it once. It belongs to the Trip.
 */
export const useNewChecklistItem = () => {
  const add = useServerFn(addOwnChecklistItem)

  return useSave({
    target: newChecklistItemTarget,
    draft: isNewItem,
    equals: (a, b) => a.text === b.text && a.reminderDate === b.reminderDate,
    scheduleId: null,
    saved: noNewItem,
    write: 'checklist',
    run: async ({ text, reminderDate }, operationId) =>
      reminderDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(reminderDate)
        ? SaveAnswer.Refused({
            problem: 'Choose a reminder date with a four-digit year.',
          })
        : answerOwn(
            await add({
              data: {
                operationId,
                text,
                ...(reminderDate !== '' && { reminderDate }),
              },
            }),
            textInvalid,
          ),
  })
}

export function AddChecklistItem({ labelledBy }: { labelledBy: string }) {
  const field = useNewChecklistItem()
  const dateId = useId()
  const { value } = field

  const change = (next: Partial<NewChecklistItem>) =>
    field.change({ ...value, ...next })

  return (
    <EditorFrame
      field={field}
      labelledBy={labelledBy}
      verb={addVerb}
      form="always"
      nameForm={false}
      ready={value.text.trim() !== ''}
    >
      {(frame) => (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            aria-labelledby={labelledBy}
            aria-describedby={frame.describedBy}
            placeholder="Something to book or confirm"
            value={value.text}
            onChange={(event) => change({ text: event.target.value })}
            readOnly={frame.busy}
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
              readOnly={frame.busy}
              className="h-10"
            />
          </div>
        </div>
      )}
    </EditorFrame>
  )
}

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
