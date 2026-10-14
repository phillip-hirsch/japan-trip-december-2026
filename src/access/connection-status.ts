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

export const currentConnection = () => status

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

export const subscribeToConnection = (listener: () => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export const useConnectionStatus = () =>
  useSyncExternalStore<ConnectionStatus>(
    subscribeToConnection,
    () => status,
    () => connected,
  )
