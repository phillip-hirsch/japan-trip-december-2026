// Trip dates as plain values, safe to import in the browser (no Effect).

/** The Trip's time zone: every Day is a calendar date in Tokyo. */
export const tripTimeZone = 'Asia/Tokyo'

/** Arrival: the first Day of the Trip, as a Tokyo calendar date. */
export const tripStartDate = '2026-12-06'

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

/** A calendar date as "Sunday, December 6". */
export const formatDay = (isoDate: string) =>
  dayFormat.format(new Date(`${isoDate}T00:00:00Z`))
