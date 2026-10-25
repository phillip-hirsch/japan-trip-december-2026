import { Predicate, Schema, Struct } from 'effect'

import { Hotel, VerifyClaimAttachment } from '@/trip/domain/domain'
import type {
  DayDetail,
  ItineraryContent,
  ScheduleStayDetail,
  StayDetail,
} from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'

export const option1WithEveryAttachment: ItineraryContent = {
  ...option1,
  verifyClaims: [
    ...option1.verifyClaims,
    {
      id: 'rail-pass',
      text: 'Rail pass prices change in October.',
      attachedTo: VerifyClaimAttachment.cases.Itinerary.make({}),
    },
  ],
}

export const withoutIds = (value: Schema.Json): Schema.Json =>
  Array.isArray(value)
    ? value.map(withoutIds)
    : Predicate.isObjectKeyword(value)
      ? Object.fromEntries(
          Object.entries<Schema.Json>(value)
            .filter(([key]) => key !== 'id')
            .map(([key, nested]) => [key, withoutIds(nested)]),
        )
      : value

export const withoutActivities = (days: ReadonlyArray<DayDetail>) =>
  days.map((day) => ({ ...day, activities: [] }))

export const withoutHotels = (stays: ReadonlyArray<StayDetail>) =>
  stays.map((stay) => ({ ...stay, hotel: Hotel.cases.NotRecorded.make({}) }))

/** A Schedule's Stays as copied, leaving out the Stay edits they offer. */
export const withoutOffers = (stays: ReadonlyArray<ScheduleStayDetail>) =>
  stays.map((stay) => Struct.omit(stay, ['offers']))
