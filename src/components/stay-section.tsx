import { useId } from 'react'
import type { ReactNode } from 'react'

import type { ScheduleStayDetail } from '@/trip/domain'

export function StaySection({
  heading,
  stay,
  children,
}: {
  heading: string
  stay: ScheduleStayDetail
  children: (headingId: string) => ReactNode
}) {
  const headingId = useId()

  return (
    <div className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm text-muted-foreground">
        {heading}
        <span className="sr-only"> for the {stay.base.romaji} Stay</span>
      </h3>
      {children(headingId)}
    </div>
  )
}
