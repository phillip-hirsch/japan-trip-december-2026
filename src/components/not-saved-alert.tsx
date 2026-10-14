import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

export const warnAfterRowGoes = (warning: {
  readonly title: string
  readonly description: string
}) => toast.add({ type: 'warning', ...warning })

export function NotSavedAlert({
  problem,
  problemId,
  children,
}: {
  problem: string
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
