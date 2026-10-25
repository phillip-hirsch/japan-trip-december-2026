import { ButtonLink } from '@/components/button-link'
import { PageMessage } from '@/components/page-message'

export function NotFound() {
  return (
    <PageMessage
      eyebrow="Not found"
      title="Nothing lives at this address"
      actions={
        <>
          <ButtonLink to="/">Home</ButtonLink>
          <ButtonLink to="/schedule" variant="outline">
            Schedule
          </ButtonLink>
        </>
      }
    >
      The link may be mistyped, or it may point to a page or a Day that doesn’t
      exist.
    </PageMessage>
  )
}
