import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * Says a save under the save pattern didn't go through, and why, with
 * whatever lets Phillip act on it.
 */
export function NotSavedAlert({
  problem,
  problemId,
  children,
}: {
  problem: string
  /** The id the field it belongs to is described by. */
  problemId?: string
  children?: ReactNode
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <Badge variant="outline" className="border-primary text-primary">
        Not saved
      </Badge>
      <p id={problemId} className="text-sm">
        {problem}
      </p>
      {children}
    </div>
  )
}

/** Retrying or dismissing a one-tap save that didn't go through. */
export function RetryOrDismiss({
  onRetry,
  onDismiss,
}: {
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" onClick={onRetry}>
        Retry
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  )
}

/** Says a save just landed, such as "Saved", for the screen reader too. */
export function SavedStatus({
  saved,
  children,
}: {
  saved: boolean
  children: string
}) {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {saved && (
        <span className="inline-flex items-center gap-1">
          <CheckIcon className="size-4" aria-hidden />
          {children}
        </span>
      )}
    </p>
  )
}
