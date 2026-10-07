import { useServerFn } from '@tanstack/react-start'
import { Match, Predicate } from 'effect'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  Hotel,
  HotelDetails,
  ScheduleId,
  WriteHotelDetailsOutcome,
} from '@/trip/domain'
import {
  hotelDetailsTarget,
  SaveAnswer,
  SaveState,
  useSave,
} from '@/trip/drafts'
import { trimmedHotelDetails } from '@/trip/hotel-details'
import { hotelDetailMaxLength } from '@/trip/limits'
import { writeHotelDetails } from '@/trip/trip.functions'

/** Hotel details as typed, '' for a field not recorded. */
type HotelFields = Required<HotelDetails>

/** The form's field for each of the Hotel details, in order. */
const hotelFields = [
  { key: 'name', label: 'Hotel name', code: false },
  { key: 'address', label: 'Address', code: false },
  // A code to read out or paste at check-in: monospaced, never spell-checked.
  { key: 'confirmationNumber', label: 'Confirmation number', code: true },
] as const

const fieldsOf = (hotel: Hotel): HotelFields =>
  Predicate.isTagged('Recorded')(hotel)
    ? {
        name: hotel.name ?? '',
        address: hotel.address ?? '',
        confirmationNumber: hotel.confirmationNumber ?? '',
      }
    : { name: '', address: '', confirmationNumber: '' }

// Fields equal once trimmed save the same.
const sameFields = (a: HotelFields, b: HotelFields) => {
  const [trimmedA, trimmedB] = [a, b].map(trimmedHotelDetails)

  return hotelFields.every(({ key }) => trimmedA?.[key] === trimmedB?.[key])
}

const isHotelFields = (value: unknown): value is HotelFields =>
  Predicate.isObject(value) &&
  hotelFields.every(({ key }) => Predicate.isString(value[key]))

const answerOf = (outcome: WriteHotelDetailsOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Written: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      StayNotFound: () =>
        SaveAnswer.Refused({
          problem:
            'This Stay is no longer part of your Schedule. Your hotel details are kept here.',
        }),
      HotelDetailTooLong: ({ maxLength }) =>
        SaveAnswer.Refused({
          problem: `Each hotel detail can be at most ${maxLength} characters.`,
        }),
    }),
  )

/**
 * A Stay's recorded Hotel details: the hotel's name, its address and the
 * confirmation number, each only once recorded.
 */
export function HotelDetailsList({
  details: { name, address, confirmationNumber },
  className,
}: {
  details: HotelDetails
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 text-sm break-words',
        className,
      )}
    >
      {name !== undefined && <p className="text-base font-medium">{name}</p>}
      {address !== undefined && <p>{address}</p>}
      {confirmationNumber !== undefined && (
        <p>
          <span className="text-muted-foreground">Confirmation </span>
          <span className="font-mono select-all">{confirmationNumber}</span>
        </p>
      )}
    </div>
  )
}

/**
 * A Stay's Hotel details, saved as a whole with an explicit Save under the
 * save pattern (`@/trip/drafts`). Key it by the Stay's id.
 */
export function HotelDetailsField({
  scheduleId,
  stayId,
  hotel,
  labelledBy,
}: {
  scheduleId: ScheduleId
  stayId: string
  hotel: Hotel
  /** The id of the heading naming the details. */
  labelledBy: string
}) {
  const write = useServerFn(writeHotelDetails)
  const fieldId = useId()
  const problemId = useId()

  const field = useSave<HotelFields>({
    draft: { target: hotelDetailsTarget(stayId), isValue: isHotelFields },
    equals: sameFields,
    scheduleId,
    saved: fieldsOf(hotel),
    write: 'hotelDetails',
    run: async (details) =>
      answerOf(await write({ data: { scheduleId, stayId, details } })),
  })

  const { state, value } = field

  if (SaveState.$is('Clean')(state) || SaveState.$is('Saved')(state)) {
    const justSaved = SaveState.$is('Saved')(state) || state.justSaved
    // What shows: the details just saved until a read confirms them, then
    // what the server holds.
    const details = trimmedHotelDetails(value)
    const recorded = Object.keys(details).length > 0

    return (
      <div className="flex flex-col items-start gap-3">
        {recorded ? (
          <HotelDetailsList details={details} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No hotel recorded yet.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-describedby={labelledBy}
            onClick={field.edit}
          >
            <PencilIcon data-icon="inline-start" aria-hidden />
            {recorded ? 'Edit hotel' : 'Add hotel'}
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
      {hotelFields.map(({ key, label, code }, index) => (
        <div key={key} className="flex flex-col gap-1.5">
          <label
            htmlFor={`${fieldId}-${key}`}
            className="text-sm text-muted-foreground"
          >
            {label}
          </label>
          <Input
            id={`${fieldId}-${key}`}
            aria-describedby={notSaved ? problemId : undefined}
            // Opening the editor focuses it; a restored draft opens unfocused.
            autoFocus={index === 0 && SaveState.$is('Editing')(state)}
            // A save in flight fixes the value, so two saves never race.
            readOnly={saving}
            value={value[key]}
            onChange={(event) =>
              field.change({ ...value, [key]: event.target.value })
            }
            maxLength={hotelDetailMaxLength}
            autoComplete="off"
            spellCheck={code ? false : undefined}
            className={cn('h-10', code && 'font-mono')}
          />
        </div>
      ))}
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
