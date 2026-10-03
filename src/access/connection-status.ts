import { Data } from 'effect'
import { useSyncExternalStore } from 'react'

/**
 * Why the browser can't reach the app's server functions, if it can't.
 *
 * - LoginExpired: Access refused the request at the edge. `reloading` is
 *   false when the loop guard stopped the automatic reload.
 * - Offline: the request never got an answer, so waiting is the fix.
 */
export type ConnectionStatus = Data.TaggedEnum<{
  Connected: {}
  Offline: {}
  LoginExpired: { readonly reloading: boolean }
}>

export const ConnectionStatus = Data.taggedEnum<ConnectionStatus>()

export const connected: ConnectionStatus = ConnectionStatus.Connected()

export const offline: ConnectionStatus = ConnectionStatus.Offline()

let status: ConnectionStatus = connected

const listeners = new Set<() => void>()

/** What the latest server function call showed. */
export const currentConnection = () => status

/** Records what the latest server function call showed. */
export const reportConnection = (next: ConnectionStatus) => {
  // Once a reload to log in is on its way, nothing else changes the banner.
  if (
    next === status ||
    (ConnectionStatus.$is('LoginExpired')(status) && status.reloading)
  )
    return
  status = next

  for (const listener of listeners) listener()
}

/** Calls the listener whenever the status changes; returns how to stop. */
export const subscribeToConnection = (listener: () => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** The current connection status, for the banners. */
export const useConnectionStatus = () =>
  useSyncExternalStore<ConnectionStatus>(
    subscribeToConnection,
    () => status,
    () => connected,
  )
