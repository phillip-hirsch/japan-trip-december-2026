/// <reference lib="webworker" />
// The service worker (ADR 0006), bundled by scripts/service-worker.ts after
// the prerender, which injects the precache list.
import { NetworkOnly, Serwist } from 'serwist'
import type { PrecacheEntry, RouteHandlerCallbackOptions } from 'serwist'

declare const self: ServiceWorkerGlobalScope & {
  readonly __SW_MANIFEST: ReadonlyArray<PrecacheEntry | string>
}

const shell = '/_shell.html'

const isAppPath = (url: URL) =>
  url.origin === self.location.origin && !url.pathname.startsWith('/cdn-cgi/')

/**
 * Only a 200 from the app itself is stored: never anything from Access's
 * login flow or under /cdn-cgi/, nor an error or a redirect to log in.
 */
const storable = (response: Response) =>
  response.status === 200 &&
  URL.canParse(response.url) &&
  isAppPath(new URL(response.url))

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
  skipWaiting: true,
  clientsClaim: true,
})

const network = new NetworkOnly({ networkTimeoutSeconds: 4 })

/**
 * Asks the Worker for the SPA shell, so the page's data comes from server
 * functions. Prerendered pages are static assets that ignore the header and
 * come back whole. Redirects stay manual, so an Access login redirect reaches
 * the browser instead of being followed here.
 */
const shellRequest = ({ url }: Request) =>
  new Request(url, {
    headers: { 'X-TSS_SHELL': 'true' },
    credentials: 'include',
    redirect: 'manual',
  })

/** Offline, a prerendered page from the precache, or else the shell. */
const offlinePage = async (url: URL) =>
  (await serwist.matchPrecache(`${url.pathname}.html`)) ??
  (await serwist.matchPrecache(shell)) ??
  Response.error()

const pageLoad = async ({
  request,
  url,
  event,
}: RouteHandlerCallbackOptions) => {
  try {
    return await network.handle({ request: shellRequest(request), event })
  } catch {
    return offlinePage(url)
  }
}

// Server-function reads are never captured: the app's transport alone says
// whether it is connected, offline or logged out.
serwist.registerCapture(
  ({ request, url }) => request.mode === 'navigate' && isAppPath(url),
  { handle: pageLoad },
)

serwist.addEventListeners()
