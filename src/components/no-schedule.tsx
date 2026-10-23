import { ButtonLink } from '@/components/button-link'
import { LastUpdated } from '@/components/last-updated'
import { PageMessage } from '@/components/page-message'
import type { ScreenQuery } from '@/trip/client/last-updated'

/**
 * The page when no Schedule exists yet, as `query` last answered. It says
 * when that was, since offline the device may hold an answer from before
 * Phillip chose one.
 */
export function NoSchedule({ query }: { query: ScreenQuery }) {
  return (
    <PageMessage
      eyebrow="Schedule"
      title="No Schedule yet"
      actions={<ButtonLink to="/options">Compare the Itineraries</ButtonLink>}
      footer={<LastUpdated query={query} className="mt-4" />}
    >
      Your Schedule starts as a copy of the Itinerary you choose. Compare the
      Itineraries, then choose one from its page.
    </PageMessage>
  )
}
