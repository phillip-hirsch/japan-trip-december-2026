import { Effect, Option, Predicate, Schema, Struct } from 'effect'

import {
  december,
  Hotel,
  OperationId,
  ScheduleId,
  VerifyClaimAttachment,
} from '@/trip/domain/domain'
import type {
  DayDetail,
  ItineraryContent,
  StayDetail,
} from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

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

export const trip = tripWith([option1WithEveryAttachment, option2])

export const firstChoose = OperationId.make(
  '7d1f8c2e-4b6a-4f0e-9a3d-2c5b8e1f4a60',
)

export const secondChoose = OperationId.make(
  'c4e2a9b1-3f7d-4e8a-b6c0-9d1e5f2a7b38',
)

export const chooseOption1 = (operationId: OperationId) =>
  Trip.use((trip) =>
    trip.choose({ operationId, optionNumber: 1, replacing: null }),
  )

export const choose = (
  optionNumber: number,
  operationId: OperationId,
  replacing: ScheduleId | null,
) => Trip.use((trip) => trip.choose({ operationId, optionNumber, replacing }))

export const schedules = Trip.use((trip) => trip.schedules)

export const archivedSchedules = Effect.map(
  schedules,
  ({ archived }) => archived,
)

export const currentSchedule = Effect.map(schedules, ({ current }) =>
  Option.getOrThrow(current),
)

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

export const revisedOption1: ItineraryContent = {
  ...option1WithEveryAttachment,
  birthdayOutline: 'A quiet birthday in Kanazawa.',
  stays: option1.stays.map((stay) => ({
    ...stay,
    accommodation: 'ryokan',
    highlights: ['Somewhere new'],
  })),
  days: option1.days.map((day) => ({ date: day.date })),
  moves: option1.moves.map((move) => Struct.omit(move, ['duration'])),
  dayTrips: [{ date: december(19), place: 'enoshima', optional: false }],
  verifyClaims: [],
  shigeharuVisit: { date: december(11), slot: 'afternoon' },
}
