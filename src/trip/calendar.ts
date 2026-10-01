// Trip dates and durations as plain values, safe to import in the browser
// (no Effect).
import type { DurationRange, IsoDate } from '@/trip/domain'

/** The Trip's time zone: every Day is a calendar date in Tokyo. */
export const tripTimeZone = 'Asia/Tokyo'

/** Arrival: the first Day of the Trip, as a Tokyo calendar date. */
export const tripStartDate = '2026-12-06' as IsoDate

/** Departure: the last Day of the Trip. */
export const tripEndDate = '2026-12-20' as IsoDate

/** The Shigeharu visit: the morning of Friday, December 11. */
export const shigeharuDate = '2026-12-11' as IsoDate

/** The Birthday: Tuesday, December 15, never a Move day. */
export const birthdayDate = '2026-12-15' as IsoDate

const format = (options: Intl.DateTimeFormatOptions) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC',
  })
  return (isoDate: string) => formatter.format(new Date(`${isoDate}T00:00:00Z`))
}

/** A calendar date as "Sunday, December 6". */
export const formatDay = format({
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

/** A number of nights as "3 nights". */
export const formatNights = (nights: number) =>
  `${nights} ${nights === 1 ? 'night' : 'nights'}`

/** A calendar date as "Dec 6". */
export const formatShortDate = format({ month: 'short', day: 'numeric' })

/** A calendar date's weekday as "Sun". */
export const formatWeekday = format({ weekday: 'short' })

/** A calendar date's day of the month as "6". */
export const formatDayOfMonth = format({ day: 'numeric' })

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours > 0 && `${hours} h`, rest > 0 && `${rest} min`]
    .filter(Boolean)
    .join(' ')
}

/** A rough travel time as "about 2 h 15 min" or "3 h 30 min – 4 h 30 min". */
export const formatDurationRange = ({
  minMinutes,
  maxMinutes,
}: DurationRange) =>
  minMinutes === maxMinutes
    ? `about ${formatMinutes(minMinutes)}`
    : `${formatMinutes(minMinutes)} – ${formatMinutes(maxMinutes)}`
