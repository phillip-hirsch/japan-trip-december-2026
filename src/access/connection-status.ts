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

const loginReloadInFlight = (current: ConnectionStatus) =>
  ConnectionStatus.$is('LoginExpired')(current) && current.reloading

export const reportConnection = (next: ConnectionStatus) => {
  if (next === status || loginReloadInFlight(status)) return
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

/**
 * Whether editing is paused: offline, nothing can be saved, so every control
 * that sends is off until a request gets an answer again.
 */
export const editingPaused = (current: ConnectionStatus = status) =>
  ConnectionStatus.$is('Offline')(current)

export const useEditingPaused = () => editingPaused(useConnectionStatus())
