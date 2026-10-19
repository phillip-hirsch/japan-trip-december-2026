import { Effect } from 'effect'

import type { IsoDate, Pin, PinTarget, ScheduleId } from '@/trip/domain/domain'
import { operation } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

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
