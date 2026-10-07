import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A notice about the whole Schedule. It stays on the page until the Schedule
 * changes, and screen readers announce it when it appears. Phillip can't
 * dismiss it.
 */
export function Notice({
  icon: Icon,
  iconClassName,
  className,
  children,
}: {
  icon: LucideIcon
  iconClassName?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground',
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0 text-muted-foreground',
          iconClassName,
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
