import { cn } from '@/lib/utils'
import { useLastUpdated } from '@/trip/client/last-updated'
import type { ScreenQuery } from '@/trip/client/last-updated'

/** When the data of the screen's `query` was last updated. */
export function LastUpdated({
  query,
  className,
}: {
  query: ScreenQuery
  className?: string
}) {
  const lastUpdated = useLastUpdated(query)

  if (lastUpdated === undefined) return null

  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      <time dateTime={lastUpdated.dateTime}>{lastUpdated.text}</time>
    </p>
  )
}
