import { BadgeAlertIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { VerifyClaimDetail } from '@/trip/domain'

/** Verify claims, each with a badge, where they're attached. */
export function VerifyClaims({
  claims,
  className,
}: {
  claims: ReadonlyArray<VerifyClaimDetail>
  className?: string
}) {
  if (claims.length === 0) return null

  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {claims.map((claim) => (
        <li
          key={claim.id}
          className="flex items-start gap-2 text-xs text-muted-foreground"
        >
          <Badge variant="outline" className="mt-px">
            <BadgeAlertIcon data-icon="inline-start" aria-hidden />
            Verify
          </Badge>
          <span className="min-w-0">{claim.text}</span>
        </li>
      ))}
    </ul>
  )
}
