import { ButtonLink } from '@/components/button-link'
import { PageMessage } from '@/components/page-message'

export function NoSchedule() {
  return (
    <PageMessage
      eyebrow="Schedule"
      title="No Schedule yet"
      actions={<ButtonLink to="/options">Compare the Itineraries</ButtonLink>}
    >
      Your Schedule starts as a copy of the Itinerary you choose. Compare the
      Itineraries, then choose one from its page.
    </PageMessage>
  )
}
