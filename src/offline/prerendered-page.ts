import { redirect } from '@tanstack/react-router'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'

/**
 * Whether the page at `href` is the one this document was loaded as. Loading
 * it whole again would only bring back what the service worker already sent,
 * such as the shell for an address with no prerendered page.
 */
const loadedAsThisDocument = (href: string) => {
  const loaded = performance.getEntriesByType('navigation')[0]?.name

  if (loaded === undefined) return true
  const here = new URL(loaded)
  const target = new URL(href, here)

  return target.pathname === here.pathname && target.search === here.search
}

/**
 * A prerendered page's loader read, or, offline, the page loaded whole. An
 * in-app link runs the read over the network; when it fails because the app
 * is offline, the page loads whole instead, and the service worker answers
 * from the precache (ADR 0006). It never reloads the page this document
 * already is, so an address with no prerendered page fails once instead of
 * reloading forever. A preload never reloads: the router follows this only
 * on a navigation.
 */
export const readOrReloadOffline = async <A>(
  href: string,
  read: () => Promise<A>,
) => {
  try {
    return await read()
  } catch (error) {
    if (
      ConnectionStatus.$is('Offline')(currentConnection()) &&
      !loadedAsThisDocument(href)
    ) {
      throw redirect({ href, reloadDocument: true })
    }

    throw error
  }
}
