import { Effect } from 'effect'

import { timeOfDayOf } from '@/trip/domain/calendar'
import { december, IsoDate, TimeOfDay } from '@/trip/domain/domain'
import type { Activity, EditActivity, ScheduleId } from '@/trip/domain/domain'
import { activitiesOn, currentScheduleId, operation } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

export const add = (
  n: number,
  scheduleId: ScheduleId,
  date: IsoDate,
  title: string,
  details: { readonly time?: string; readonly note?: string } = {},
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.addActivity({
        operationId: operation(n),
        scheduleId,
        date,
        title,
        ...(details.time !== undefined && {
          time: TimeOfDay.make(details.time),
        }),
        ...(details.note !== undefined && { note: details.note }),
      }),
    ),
    ({ activityId }) => activityId,
  )

export const edit = (input: EditActivity) =>
  Trip.use((trip) => trip.editActivity(input))

export const remove = (scheduleId: ScheduleId, activityId: string) =>
  Trip.use((trip) => trip.removeActivity({ scheduleId, activityId }))

export const move = (
  scheduleId: ScheduleId,
  activityId: string,
  before: string | null,
) => Trip.use((trip) => trip.moveActivity({ scheduleId, activityId, before }))

export const described = ({ title, time, note }: Activity) =>
  [
    time === undefined ? '--:--' : timeOfDayOf(time),
    title,
    ...(note ? [`(${note})`] : []),
  ].join(' ')

export const describedOn = (date: IsoDate) =>
  Effect.map(activitiesOn(date), (activities) => activities.map(described))

export const dayWithThree = Effect.gen(function* () {
  const scheduleId = yield* currentScheduleId

  const temple = yield* add(2, scheduleId, december(15), 'Kiyomizu-dera', {
    time: '09:00',
  })

  const walk = yield* add(3, scheduleId, december(15), 'Walk Gion')

  const dinner = yield* add(4, scheduleId, december(15), 'Birthday dinner', {
    time: '19:00',
  })

  return { scheduleId, temple, walk, dinner }
})
