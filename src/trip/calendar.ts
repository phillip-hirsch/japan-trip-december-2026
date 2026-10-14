import type { DurationRange, IsoDate } from '@/trip/domain'

export const tripTimeZone = 'Asia/Tokyo'

// SAFETY: valid ISO date literal for the Arrival.
export const tripStartDate = '2026-12-06' as IsoDate

// SAFETY: valid ISO date literal for the Departure.
export const tripEndDate = '2026-12-20' as IsoDate

// SAFETY: valid ISO date literal for the Shigeharu visit.
export const shigeharuDate = '2026-12-11' as IsoDate

// SAFETY: valid ISO date literal for the Birthday.
export const birthdayDate = '2026-12-15' as IsoDate

const dayInMilliseconds = 24 * 60 * 60 * 1000

const midnightUtc = (isoDate: IsoDate) => Date.parse(`${isoDate}T00:00:00Z`)

export const tripDates: ReadonlyArray<IsoDate> = Array.from(
  {
    length:
      (midnightUtc(tripEndDate) - midnightUtc(tripStartDate)) /
        dayInMilliseconds +
      1,
  },
  // SAFETY: UTC day steps between the valid endpoints yield ISO calendar dates; Trip tests cover all 15 Days.
  (_, index) =>
    new Date(midnightUtc(tripStartDate) + index * dayInMilliseconds)
      .toISOString()
      .slice(0, 10) as IsoDate,
)

/**
 * Tokyo's offset from UTC. Japan has kept UTC+9 with no daylight saving since
 * 1951, so the next Tokyo midnight is plain arithmetic in the browser.
 */
const tokyoOffsetInMilliseconds = 9 * 60 * 60 * 1000

export const millisecondsUntilTokyoMidnight = (now: number) => {
  const tokyo = now + tokyoOffsetInMilliseconds

  return Math.ceil((tokyo + 1) / dayInMilliseconds) * dayInMilliseconds - tokyo
}

export const isTripDate = (date: string): date is IsoDate =>
  tripDates.some((tripDate) => tripDate === date)

export const previousTripDate = (date: IsoDate) =>
  tripDates[tripDates.indexOf(date) - 1]

export const nightsBetween = (checkIn: IsoDate, checkOut: IsoDate) =>
  tripDates.indexOf(checkOut) - tripDates.indexOf(checkIn)

export const nextTripDate = (date: IsoDate) =>
  tripDates[tripDates.indexOf(date) + 1]

const formatter = (options: Intl.DateTimeFormatOptions) => {
  const dateTimeFormat = new Intl.DateTimeFormat('en-US', options)

  return (date: Date) => dateTimeFormat.format(date)
}

/** A calendar date's formatter, which midnight UTC keeps on that date. */
const format = (options: Intl.DateTimeFormatOptions) => {
  const formatDate = formatter({ ...options, timeZone: 'UTC' })

  return (isoDate: string) => formatDate(new Date(`${isoDate}T00:00:00Z`))
}

export const formatDay = format({
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export const timeOfDayPattern = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * An Activity's time, a zoned date-time in Tokyo such as
 * 2026-12-15T19:00:00.000+09:00[Asia/Tokyo], as its time of day, "19:00".
 */
export const timeOfDayOf = (time: string) => time.slice(11, 16)

export const formatNights = (nights: number) =>
  `${nights} ${nights === 1 ? 'night' : 'nights'}`

export const formatShortDate = format({ month: 'short', day: 'numeric' })

export const formatWeekday = format({ weekday: 'short' })

export const formatDayOfMonth = format({ day: 'numeric' })

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return [hours > 0 && `${hours} h`, rest > 0 && `${rest} min`]
    .filter(Boolean)
    .join(' ')
}

export const formatDurationRange = ({
  minMinutes,
  maxMinutes,
}: DurationRange) =>
  minMinutes === maxMinutes
    ? `about ${formatMinutes(minMinutes)}`
    : `${formatMinutes(minMinutes)} – ${formatMinutes(maxMinutes)}`

const formatTokyoDate = formatter({
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: tripTimeZone,
})

export const formatMoment = (isoInstant: string) =>
  formatTokyoDate(new Date(isoInstant))
