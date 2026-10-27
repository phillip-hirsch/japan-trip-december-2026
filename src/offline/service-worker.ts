/// <reference lib="webworker" />
// The service worker (ADR 0006), bundled by scripts/service-worker.ts after
// the prerender, which injects the precache list.
import { NetworkOnly, Serwist } from 'serwist'
import type { PrecacheEntry, RouteHandlerCallbackOptions } from 'serwist'

import { pageFile, shellHeaders, shellPath } from '@/offline/shell'

declare const self: ServiceWorkerGlobalScope & {
  readonly __SW_MANIFEST: ReadonlyArray<PrecacheEntry | string>
}

const isAppPath = (url: URL) =>
  url.origin === self.location.origin && !url.pathname.startsWith('/cdn-cgi/')

/**
 * The precache stores only a 200 from the app itself. It never stores
 * anything from Access's login flow or under /cdn-cgi/, an error, or a
 * redirect to log in.
 */
const storable = (response: Response) =>
  response.status === 200 &&
  URL.canParse(response.url) &&
  isAppPath(new URL(response.url))

// The worker doesn't skip waiting. A new build's worker activates once the app
// is closed, so an open page never loses the precached chunks of its build.
const serwist = new Serwist({
  precacheEntries: [...self.__SW_MANIFEST],
  precacheOptions: {
    // Page loads go to the network first, so no page URL may match a
    // precached `.html` file and be answered from the cache.
    cleanURLs: false,
    directoryIndex: null,
    cleanupOutdatedCaches: true,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          storable(response) ? response : null,
      },
    ],
  },
  clientsClaim: true,
})

// A connection that hangs, as in a tunnel, counts as failed after a few
// seconds, so the app opens from the precache instead of a blank screen. The
// shell's own server-function reads still report a late login redirect.
const network = new NetworkOnly({ networkTimeoutSeconds: 4 })

/**
 * Asks the Worker for the SPA shell, so the page's data comes from server
 * functions. Redirects stay manual, so an Access login redirect reaches
 * the browser instead of being followed here.
 */
const shellRequest = ({ url }: Request) =>
  new Request(url, {
    headers: shellHeaders,
    credentials: 'include',
    redirect: 'manual',
  })

const pageLoad = async ({ request, event }: RouteHandlerCallbackOptions) => {
  try {
    return await network.handle({ request: shellRequest(request), event })
  } catch {
    // Offline, every page load opens the shell from the precache.
    return (
      (await serwist.matchPrecache(pageFile(shellPath))) ?? Response.error()
    )
  }
}

// The worker never captures server-function reads. Only the app's transport
// says whether it is connected, offline or logged out.
const pageLoads = serwist.registerCapture(
  ({ request, url }) => request.mode === 'navigate' && isAppPath(url),
  { handle: pageLoad },
)

// Serwist registers its precache route first. Page loads go before it, so a
// load of a precached address, such as `/_shell.html`, still goes to the
// network first.
serwist.unregisterRoute(pageLoads)

serwist.routes.get('GET')?.unshift(pageLoads)

serwist.addEventListeners()
