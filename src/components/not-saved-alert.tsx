import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'

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
