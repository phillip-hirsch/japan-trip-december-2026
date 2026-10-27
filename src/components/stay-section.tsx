import { useId } from 'react'
import type { ReactNode } from 'react'

import type { AnchorWarning, ScheduleStayDetail } from '@/trip/domain/domain'

/**
 * What a Stay edit editor works on: a Stay of the Schedule shown, with the
 * Stay edits it offers, the Stays its offers name, and the Anchor warnings
 * before the edit.
 */
export interface StayEditorProps {
  readonly stay: ScheduleStayDetail
  readonly stays: ReadonlyArray<ScheduleStayDetail>
  readonly anchorWarnings: ReadonlyArray<AnchorWarning>
}

/** The Stay of the Schedule shown that an offer names, if any. */
export const stayNamed = (
  stays: ReadonlyArray<ScheduleStayDetail>,
  stayId: string | undefined,
) => (stayId === undefined ? undefined : stays.find(({ id }) => id === stayId))

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
