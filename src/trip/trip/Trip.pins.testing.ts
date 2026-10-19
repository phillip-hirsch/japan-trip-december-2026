import { Effect, Option } from 'effect'

import type { IsoDate, Pin, PinTarget, ScheduleId } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { operation, tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

export const trip = tripWith([option1, option2])

export const choose = (
  optionNumber: number,
  n: number,
  replacing: ScheduleId | null,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

export const setPin = (scheduleId: ScheduleId, target: PinTarget, pin?: Pin) =>
  Trip.use((trip) =>
    trip.setPin({ scheduleId, target, ...(pin !== undefined && { pin }) }),
  )

export const addActivity = (
  n: number,
  scheduleId: ScheduleId,
  date: IsoDate,
  title: string,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.addActivity({ operationId: operation(n), scheduleId, date, title }),
    ),
    ({ activityId }) => activityId,
  )

export const activityTarget = (activityId: string): PinTarget => ({
  activityId,
})

export const hotelTarget = (stayId: string): PinTarget => ({ stayId })

export const activitiesOn = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).day.activities,
  )

export const staysOf = (scheduleId: ScheduleId) =>
  Effect.map(
    Trip.use((trip) => trip.schedule(scheduleId)),
    ({ stays }) => stays,
  )

export const kyotoStayId = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.id ?? '')

export const kyotoHotelOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.hotel)

export const tonightsHotel = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).tonight?.hotel,
  )

export const fushimiInari: Pin = {
  coordinates: { latitude: 34.9671402, longitude: 135.7726717 },
  link: 'https://goo.gl/maps/9e6EdUNDE18LuEwR7',
}

export const droppedByHand: Pin = {
  coordinates: { latitude: 34.9858, longitude: 135.7588 },
}

export const ryokan = {
  name: 'Kyoto Ryokan Sakura',
  address: '231 Higashi-Kujo, Minami-ku, Kyoto',
}
