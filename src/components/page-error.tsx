import { useRouter } from '@tanstack/react-router'

import {
  ConnectionStatus,
  useConnectionStatus,
} from '@/access/connection-status'
import { Button } from '@/components/ui/button'

/**
 * A page whose loader failed, shown inside the app's frame. Offline, it says
 * the page needs a connection; the banner above says when it is back.
 */
export function PageError() {
  const router = useRouter()
  const offline = ConnectionStatus.$is('Offline')(useConnectionStatus())

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 md:px-12">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
        {offline ? 'Offline' : 'Not loaded'}
      </p>
      <h1 className="mt-4 text-4xl font-semibold md:text-5xl">
        {offline ? 'This page needs a connection' : 'This page didn’t load'}
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {offline
          ? 'It isn’t stored on this device yet. Try again once you’re back online.'
          : 'Something went wrong while loading it. Try again.'}
      </p>
      <div className="mt-8 flex gap-2">
        <Button onClick={() => void router.invalidate()}>Try again</Button>
      </div>
    </section>
  )
}
