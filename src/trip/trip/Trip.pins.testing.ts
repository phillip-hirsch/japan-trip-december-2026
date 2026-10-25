import { Effect } from 'effect'

import type { IsoDate, Pin, PinTarget } from '@/trip/domain/domain'
import { operation } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

export const setPin = (target: PinTarget, pin?: Pin) =>
  Trip.use((trip) => trip.setPin({ target, ...(pin !== undefined && { pin }) }))

export const addActivity = (n: number, date: IsoDate, title: string) =>
  Effect.map(
    Trip.use((trip) =>
      trip.addActivity({ operationId: operation(n), date, title }),
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
