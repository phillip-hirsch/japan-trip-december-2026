import { focusManager, QueryClient } from '@tanstack/react-query'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'

/**
 * Refetches on more returns than TanStack Query notices alone. There is no
 * live push, so a change made on another device arrives this way.
 *
 * - Query counts only `visibilitychange` as focus, but a desktop window can
 *   regain focus without ever having been hidden.
 * - An outage or captive portal can end without an `online` event, so a
 *   server function call answering after "offline" is a reconnect too.
 */
const refetchOnReturn = (queryClient: QueryClient) => {
  focusManager.setEventListener((onFocus) => {
    const listener = () => onFocus()
    window.addEventListener('visibilitychange', listener)
    window.addEventListener('focus', listener)

    return () => {
      window.removeEventListener('visibilitychange', listener)
      window.removeEventListener('focus', listener)
    }
  })
  let wasOffline = ConnectionStatus.$is('Offline')(currentConnection())
  subscribeToConnection(() => {
    const connection = currentConnection()

    if (wasOffline && ConnectionStatus.$is('Connected')(connection)) {
      queryClient.getQueryCache().onOnline()
    }

    wasOffline = ConnectionStatus.$is('Offline')(connection)
  })
}

/**
 * Offline, a page opens on stored data, such as a Day the Schedule snapshot
 * filled but never shown. So the cache keeps unused queries, however long the
 * app stays open.
 */
export const queryDefaults = { gcTime: Infinity } as const

export const createQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: queryDefaults },
  })

  // In the browser the cache also outlasts the app, on the device.
  if (typeof window !== 'undefined') {
    refetchOnReturn(queryClient)
    keepCacheOnDevice(queryClient)
  }

  return queryClient
}
