import { KeyRoundIcon, WifiOffIcon } from 'lucide-react'

import {
  ConnectionStatus,
  useConnectionStatus,
} from '@/access/connection-status'
import { logInAgain } from '@/access/server-fn-fetch'
import { Button } from '@/components/ui/button'

/**
 * Says why the app can't reach its server: "login expired" (log in again) in
 * vermilion, or "offline" (wait) in a quiet grey, so the two never look alike.
 */
export function ConnectionBanner() {
  const status = useConnectionStatus()

  if (ConnectionStatus.$is('Connected')(status)) return null

  if (ConnectionStatus.$is('Offline')(status)) {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-border bg-secondary px-4 pt-[calc(0.625rem+env(safe-area-inset-top))] pb-2.5 text-sm text-secondary-foreground"
      >
        <WifiOffIcon className="size-4 shrink-0 text-muted-foreground" />
        <p>
          <span className="font-semibold">Offline.</span>{' '}
          <span className="text-muted-foreground">
            Waiting for a connection.
          </span>
        </p>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 bg-primary px-4 pt-[calc(0.625rem+env(safe-area-inset-top))] pb-2.5 text-sm text-primary-foreground"
    >
      <KeyRoundIcon className="size-4 shrink-0" />
      <p className="flex-1">
        <span className="font-semibold">Login expired.</span>{' '}
        {status.reloading
          ? 'Taking you to log in…'
          : 'The login page didn’t open.'}
      </p>
      {status.reloading ? null : (
        <Button size="sm" variant="secondary" onClick={logInAgain}>
          Log in again
        </Button>
      )}
    </div>
  )
}
