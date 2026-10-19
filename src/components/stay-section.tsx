import { useId } from 'react'
import type { ReactNode } from 'react'

import type {
  AnchorWarning,
  ScheduleId,
  ScheduleStayDetail,
} from '@/trip/domain/domain'

/**
 * What a Stay edit editor works on: a Stay of the Schedule shown, the Stay
 * after it if any, and the Anchor warnings before the edit.
 */
export interface StayEditorProps {
  readonly scheduleId: ScheduleId
  readonly stay: ScheduleStayDetail
  readonly next: ScheduleStayDetail | undefined
  readonly anchorWarnings: ReadonlyArray<AnchorWarning>
}

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
