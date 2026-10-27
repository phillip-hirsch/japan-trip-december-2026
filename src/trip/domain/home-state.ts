import { Data } from 'effect'

import { daysBetween, tripEndDate, tripStartDate } from '@/trip/domain/calendar'
import type {
  DayPage,
  HomeState,
  IsoDate,
  ScheduleDetail,
} from '@/trip/domain/domain'

const HomeStates = Data.taggedEnum<HomeState>()

/**
 * Home on a Tokyo date: the countdown before the Trip, Today during it, and
 * the Schedule as a record after it. The Trip service's Home calls it on the
 * server, and the browser calls it offline once Tokyo moves on to a new date,
 * so the two never disagree on which Day is Today. Undefined during the Trip
 * when Today's page isn't there.
 */
export const homeStateOn = (
  date: IsoDate,
  {
    readAt,
    schedule,
    today,
  }: {
    readonly readAt: string
    readonly schedule: ScheduleDetail
    /** The Day page of `date`, needed only during the Trip. */
    readonly today: DayPage | undefined
  },
): HomeState | undefined => {
  if (date < tripStartDate) {
    return HomeStates.BeforeTrip({
      readAt,
      daysToGo: daysBetween(date, tripStartDate),
      schedule,
    })
  }

  if (date > tripEndDate) return HomeStates.AfterTrip({ readAt, schedule })

  return today && HomeStates.DuringTrip({ readAt, date, today })
}
