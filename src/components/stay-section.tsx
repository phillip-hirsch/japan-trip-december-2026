import { useId } from 'react'
import type { ReactNode } from 'react'

import type { ScheduleStayDetail } from '@/trip/domain'

/** A part of a Stay on the Schedule, under its own heading. */
export function StaySection({
  heading,
  stay,
  children,
}: {
  heading: string
  stay: ScheduleStayDetail
  /** What the section holds, given the id of its heading. */
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
