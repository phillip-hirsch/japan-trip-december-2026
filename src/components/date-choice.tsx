import { ChipChoice } from '@/components/chip-choice'
import { formatShortDate, formatWeekday } from '@/trip/calendar'
import type { IsoDate } from '@/trip/domain'

/**
 * One of a few Trip dates, chosen from a row of chips, each with its weekday.
 * Put it in a fieldset whose legend says what the date is for.
 */
export function DateChoice({
  dates,
  value,
  disabled,
  onChange,
}: {
  dates: ReadonlyArray<IsoDate>
  /** The date chosen, if it's one of the dates. */
  value: IsoDate | undefined
  disabled: boolean
  onChange: (date: IsoDate) => void
}) {
  return (
    <ChipChoice
      options={dates.map((date) => ({
        value: date,
        label: (
          <time dateTime={date}>
            {formatWeekday(date)} {formatShortDate(date)}
          </time>
        ),
      }))}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  )
}
