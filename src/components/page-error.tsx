import { useRouter } from '@tanstack/react-router'

import {
  ConnectionStatus,
  useConnectionStatus,
} from '@/access/connection-status'
import { PageMessage } from '@/components/page-message'
import { Button } from '@/components/ui/button'

/**
 * A page whose loader failed, shown inside the app's frame. Offline, it says
 * the page needs a connection; the banner above says when it is back.
 */
export function PageError() {
  const router = useRouter()
  const offline = ConnectionStatus.$is('Offline')(useConnectionStatus())

  return (
    <PageMessage
      eyebrow={offline ? 'Offline' : 'Not loaded'}
      title={offline ? 'This page needs a connection' : 'This page didn’t load'}
      actions={
        <Button onClick={() => void router.invalidate()}>Try again</Button>
      }
    >
      {offline
        ? 'It isn’t stored on this device yet. Try again once you’re back online.'
        : 'Something went wrong while loading it. Try again.'}
    </PageMessage>
  )
}
