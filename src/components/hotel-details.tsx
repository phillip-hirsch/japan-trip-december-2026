import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { EditorFrame } from '@/components/editor-frame'
import { OpenInGoogleMaps } from '@/components/open-in-google-maps'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Hotel, HotelDetails, Pin, ScheduleId } from '@/trip/domain/domain'
import {
  answerOwn,
  hotelDetailsTarget,
  SaveAnswer,
  useSave,
} from '@/trip/client/drafts'
import { trimmedHotelDetails } from '@/trip/domain/hotel-details'
import { hotelDetailMaxLength } from '@/trip/domain/limits'
import { writeHotelDetails } from '@/trip/trip/trip.functions'

type HotelFields = Required<HotelDetails>

const hotelFields = [
  { key: 'name', label: 'Hotel name', code: false },
  { key: 'address', label: 'Address', code: false },
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

const sameFields = (a: HotelFields, b: HotelFields) => {
  const [trimmedA, trimmedB] = [a, b].map(trimmedHotelDetails)

  return hotelFields.every(({ key }) => trimmedA?.[key] === trimmedB?.[key])
}

const isHotelFields = (value: unknown): value is HotelFields =>
  Predicate.isObject(value) &&
  hotelFields.every(({ key }) => Predicate.isString(value[key]))

const tooLong = ({ maxLength }: { readonly maxLength: number }) =>
  SaveAnswer.Refused({
    problem: `Each hotel detail can be at most ${maxLength} characters.`,
  })

export function HotelDetailsList({
  details: { name, address, confirmationNumber, pin },
  className,
}: {
  details: HotelDetails & { readonly pin?: Pin }
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
      {pin && <OpenInGoogleMaps pin={pin} className="mt-1" />}
    </div>
  )
}

/** The Hotel details of a Stay of the Schedule shown, recorded as `hotel`. */
export const useHotelDetails = ({
  scheduleId,
  stayId,
  hotel,
}: {
  scheduleId: ScheduleId
  stayId: string
  hotel: Hotel
}) => {
  const write = useServerFn(writeHotelDetails)

  return useSave<HotelFields>({
    target: hotelDetailsTarget(stayId),
    draft: isHotelFields,
    equals: sameFields,
    scheduleId,
    saved: fieldsOf(hotel),
    write: 'hotelDetails',
    run: async (details) =>
      answerOwn(
        await write({ data: { scheduleId, stayId, details } }),
        tooLong,
      ),
  })
}

export function HotelDetailsField({
  labelledBy,
  ...props
}: Parameters<typeof useHotelDetails>[0] & { labelledBy: string }) {
  const field = useHotelDetails(props)
  const fieldId = useId()
  const { value } = field
  const details = trimmedHotelDetails(value)
  const recorded = Object.keys(details).length > 0

  return (
    <EditorFrame
      field={field}
      labelledBy={labelledBy}
      summary={
        recorded ? (
          <HotelDetailsList details={details} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No hotel recorded yet.
          </p>
        )
      }
      edits={[
        {
          label: recorded ? 'Edit hotel' : 'Add hotel',
          icon: PencilIcon,
          onClick: field.edit,
        },
      ]}
    >
      {(frame) =>
        hotelFields.map(({ key, label, code }, index) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-${key}`}
              className="text-sm text-muted-foreground"
            >
              {label}
            </label>
            <Input
              id={`${fieldId}-${key}`}
              aria-describedby={frame.describedBy}
              autoFocus={index === 0 && frame.autoFocus}
              readOnly={frame.locked}
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
        ))
      }
    </EditorFrame>
  )
}
