import { redirect } from '@tanstack/react-router'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import { pageFile, pagePath } from '@/offline/shell'

/**
 * Whether the service worker holds the prerendered page at `href`, so that
 * loading it whole offline brings back the page with its data. Precache keys
 * carry a revision in their query, hence `ignoreSearch`.
 */
const isPrecached = async (href: string) => {
  if (!('caches' in window)) return false
  const { pathname } = new URL(href, window.location.origin)

  return (
    (await caches.match(pageFile(pagePath(pathname)), {
      ignoreSearch: true,
    })) !== undefined
  )
}

/**
 * A prerendered page's loader read, or, offline, the page loaded whole. An
 * in-app link runs the read over the network; when it fails because the app
 * is offline and the service worker holds the page, the page loads whole
 * instead, answered from the precache (ADR 0006). A page it doesn't hold,
 * such as `/options/9`, fails once instead of reloading into the shell
 * forever. A preload never reloads: the router follows this only on a
 * navigation.
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
      (await isPrecached(href))
    ) {
      throw redirect({ href, reloadDocument: true })
    }

    throw error
  }
}
