import { useSyncExternalStore } from 'react'

/**
 * Why the browser can't reach the app's server functions, if it can't.
 *
 * - LoginExpired: Access refused the request at the edge. `reloading` is
 *   false when the loop guard stopped the automatic reload.
 * - Offline: the request never got an answer, so waiting is the fix.
 */
export type ConnectionStatus =
  | { readonly _tag: 'Connected' }
  | { readonly _tag: 'Offline' }
  | { readonly _tag: 'LoginExpired'; readonly reloading: boolean }

export const connected: ConnectionStatus = { _tag: 'Connected' }
export const offline: ConnectionStatus = { _tag: 'Offline' }

let status: ConnectionStatus = connected
const listeners = new Set<() => void>()

/** Records what the latest server function call showed. */
export const reportConnection = (next: ConnectionStatus) => {
  // Once a reload to log in is on its way, nothing else changes the banner.
  if (next === status || (status._tag === 'LoginExpired' && status.reloading))
    return
  status = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  const reconnect = () => {
    if (status === offline) reportConnection(connected)
  }
  window.addEventListener('online', reconnect)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('online', reconnect)
  }
}

/** The current connection status, for the banners. */
export const useConnectionStatus = () =>
  useSyncExternalStore<ConnectionStatus>(
    subscribe,
    () => status,
    () => connected,
  )
