import { useId } from 'react'
import type { ReactNode } from 'react'

import { NotSavedAlert } from '@/components/not-saved-alert'
import { Button } from '@/components/ui/button'
import type { ScheduleStayDetail } from '@/trip/domain'
import { SaveState } from '@/trip/drafts'

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

/**
 * A Stay edit Phillip has open that the refreshed Schedule no longer offers:
 * any refusal of it, why it can't be sent, and the way to dismiss it.
 */
export function WithdrawnStayEdit<V>({
  labelledBy,
  state,
  reason,
  onDiscard,
}: {
  labelledBy: string
  state: SaveState<V>
  reason: string
  onDiscard: () => void
}) {
  const notSaved = SaveState.$is('NotSaved')(state)

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-col items-start gap-3"
    >
      {notSaved && <NotSavedAlert problem={state.problem} />}
      <p className="text-sm text-muted-foreground">{reason}</p>
      <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
        {notSaved ? 'Discard' : 'Cancel'}
      </Button>
    </div>
  )
}
