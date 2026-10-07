import { useId } from 'react'

import { cn } from '@/lib/utils'
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
  const name = useId()

  return (
    <div className="flex flex-wrap gap-2">
      {dates.map((date) => (
        <label
          key={date}
          className={cn(
            'flex h-8 cursor-pointer items-center rounded-md border border-border px-2.5 text-sm font-medium tabular-nums transition-colors select-none hover:bg-muted dark:border-input dark:bg-input/30',
            'has-checked:border-primary has-checked:bg-primary/15 has-checked:text-foreground',
            'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <input
            type="radio"
            name={name}
            value={date}
            checked={value === date}
            disabled={disabled}
            onChange={() => onChange(date)}
            className="sr-only"
          />
          <time dateTime={date}>
            {formatWeekday(date)} {formatShortDate(date)}
          </time>
        </label>
      ))}
    </div>
  )
}
