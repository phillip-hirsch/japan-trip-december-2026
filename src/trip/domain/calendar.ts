import type {
  DurationRange,
  IsoDate,
  TokyoDateTime,
} from '@/trip/domain/domain'

export const tripTimeZone = 'Asia/Tokyo'

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whether a string is a real calendar date, as YYYY-MM-DD. The round trip
 * rejects an impossible date such as 2026-02-30, which otherwise normalises
 * silently to another date. The pattern rejects an expanded year such as
 * +010000-01, whose first ten characters survive the round trip.
 */
export const isCalendarDate = (date: string) => {
  const midnight = new Date(`${date}T00:00:00Z`)

  return (
    calendarDatePattern.test(date) &&
    !Number.isNaN(midnight.getTime()) &&
    midnight.toISOString().slice(0, 10) === date
  )
}

const isIsoDate = (date: string): date is IsoDate => isCalendarDate(date)

const calendarDate = (date: string) => {
  if (!isIsoDate(date)) throw new Error(`${date} is not a calendar date.`)

  return date
}

export const tripStartDate = calendarDate('2026-12-06')

export const tripEndDate = calendarDate('2026-12-20')

export const shigeharuDate = calendarDate('2026-12-11')

export const birthdayDate = calendarDate('2026-12-15')

const dayInMilliseconds = 24 * 60 * 60 * 1000

const midnightUtc = (isoDate: IsoDate) => Date.parse(`${isoDate}T00:00:00Z`)

/** The Thursday before the Shigeharu visit, whose night ends with it. */
export const shigeharuEveDate = calendarDate(
  new Date(midnightUtc(shigeharuDate) - dayInMilliseconds)
    .toISOString()
    .slice(0, 10),
)

export const tripDates: ReadonlyArray<IsoDate> = Array.from(
  {
    length:
      (midnightUtc(tripEndDate) - midnightUtc(tripStartDate)) /
        dayInMilliseconds +
      1,
  },
  (_, index) =>
    calendarDate(
      new Date(midnightUtc(tripStartDate) + index * dayInMilliseconds)
        .toISOString()
        .slice(0, 10),
    ),
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
export const timeOfDayOf = (time: TokyoDateTime) => time.slice(11, 16)

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
