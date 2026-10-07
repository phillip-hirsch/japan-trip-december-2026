import { useId } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * One of a few options, chosen from a row of chips. Put it in a fieldset
 * whose legend says what the choice is for.
 */
export function ChipChoice<T extends string>({
  options,
  value,
  disabled,
  onChange,
}: {
  options: ReadonlyArray<{ readonly value: T; readonly label: ReactNode }>
  /** The option chosen, if it's one of the options. */
  value: T | undefined
  disabled: boolean
  onChange: (value: T) => void
}) {
  const name = useId()

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
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
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
