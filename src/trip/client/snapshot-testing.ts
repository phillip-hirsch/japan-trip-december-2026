import { vi } from 'vite-plus/test'

import { scheduleId } from '@/trip/client/editor-testing'
import { tripDates } from '@/trip/domain/calendar'
import { december, IsoInstant } from '@/trip/domain/domain'
import type { DayPage, IsoDate, ScheduleSnapshot } from '@/trip/domain/domain'
import { getScheduleSnapshot } from '@/trip/trip/trip.functions'

/** The page of an empty Day of Phillip's Schedule, with `note` if given. */
export const dayPage = (date: IsoDate, note?: string): DayPage => ({
  scheduleId,
  day: {
    date,
    anchors: [],
    dayTrips: [],
    verifyClaims: [],
    freeDay: false,
    activities: [],
    ...(note !== undefined && { note }),
  },
})

/** A snapshot of Phillip's Schedule whose December 14 has `dayNote`. */
export const snapshotWith = (dayNote: string): ScheduleSnapshot => {
  const days = tripDates.map((date) =>
    dayPage(date, date === december(14) ? dayNote : undefined),
  )

  return {
    schedules: {
      current: {
        id: scheduleId,
        status: 'current',
        sourceOptionNumber: 1,
        sourceContentVersion: 'v1',
        chosenAt: IsoInstant.make('2026-10-01T00:00:00.000Z'),
        archivedAt: null,
        birthdayOutline: '',
        sourceItinerary: 'unchanged',
        verifyClaims: [],
        stays: [],
        days: days.map(({ day }) => day),
        anchorWarnings: [],
      },
      archived: [],
      tripNote: 'Pack light.',
    },
    days,
    checklist: { scheduleId, items: [] },
  }
}

/**
 * Has the server answer every Schedule snapshot read with `snapshot`. The
 * test file mocks `@/trip/trip/trip.functions`.
 */
export const answerSnapshot = (snapshot: ScheduleSnapshot) =>
  vi.mocked(getScheduleSnapshot).mockImplementation(async () => snapshot)
