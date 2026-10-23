import { Data } from 'effect'

import { daysBetween, tripEndDate, tripStartDate } from '@/trip/domain/calendar'
import type {
  DayPage,
  HomeState,
  IsoDate,
  ItinerarySummary,
  ScheduleDetail,
} from '@/trip/domain/domain'

const HomeStates = Data.taggedEnum<HomeState>()

/**
 * Home on a Tokyo date: the countdown before the Trip, Today during it, and
 * the Schedule as a record after it. The Trip service's Home calls it on the
 * server, and the browser calls it offline once Tokyo moves on to a new date,
 * so the two never disagree on which Day is Today.
 */
export const homeStateOn = (
  date: IsoDate,
  {
    readAt,
    itineraries,
    schedule,
    today,
  }: {
    readonly readAt: string
    readonly itineraries: ReadonlyArray<ItinerarySummary>
    readonly schedule: ScheduleDetail | null
    /** The Day page of `date`, null when it has none. */
    readonly today: DayPage | null
  },
): HomeState => {
  const shared = { readAt, itineraries }

  if (date < tripStartDate) {
    return HomeStates.BeforeTrip({
      ...shared,
      daysToGo: daysBetween(date, tripStartDate),
      schedule,
    })
  }

  if (date > tripEndDate) return HomeStates.AfterTrip({ ...shared, schedule })

  return HomeStates.DuringTrip({ ...shared, date, today })
}
