import { redirect } from '@tanstack/react-router'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'

/**
 * A prerendered page's loader read. Following an in-app link runs the read
 * over the network; when it fails because the app is offline, the page loads
 * whole instead, and the service worker answers from the precache (ADR 0006).
 * A preload never reloads the page: the router only follows this on a
 * navigation.
 */
export const readPrerenderedPage = async <A>(
  href: string,
  read: () => Promise<A>,
) => {
  try {
    return await read()
  } catch (error) {
    if (ConnectionStatus.$is('Offline')(currentConnection())) {
      throw redirect({ href, reloadDocument: true })
    }

    throw error
  }
}
