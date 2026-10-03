import { focusManager, QueryClient } from '@tanstack/react-query'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'

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
 * The cache of server data: one per request on the server, one for the page
 * in the browser. Its data is stale at once, so opening the app, focusing it
 * and reconnecting all refetch whatever is shown.
 */
export const makeQueryClient = () => {
  const queryClient = new QueryClient()

  if (typeof window !== 'undefined') refetchOnReturn(queryClient)

  return queryClient
}
