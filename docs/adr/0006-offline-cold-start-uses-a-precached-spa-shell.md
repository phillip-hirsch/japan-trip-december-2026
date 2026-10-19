---
status: accepted
---

# Offline cold start uses a precached SPA shell

With no signal, the installed Home Screen app loads every page from a service worker. The worker answers with TanStack Start's SPA shell (`/_shell.html`), which the build precaches. The shell holds the root route only and no loader data. The page then renders from data stored on the device. We chose this over a complete SSR navigation fallback, which caches each server-rendered page, for three reasons. Any page, including a Day not opened recently, can render offline as long as its data is stored. The device keeps one copy of the Schedule instead of one inside every cached page. And the shell never points at assets an earlier deploy removed. Both approaches passed the cold-start test on Phillip's iPhone, so these three properties decided it (#32).

## Evidence

The `prototype/offline-cold-start` branch keeps the prototype of each candidate. These are prototype results: the iPhone ran preview builds of commit `26e7a7d` and the simulator ran local builds of `02b184c`, which has the same service worker. Each was built with `OFFLINE_CANDIDATE=shell` or `OFFLINE_CANDIDATE=ssr`. The build #33 ships still needs its own iPhone cold-start check, which #37 repeats before the trip.

| Cold start from the Home Screen                                                     | SPA shell                                      | SSR navigation fallback                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| iPhone, Airplane Mode, app fully closed (2026-10-19, preview Workers behind Access) | Home rendered, served from the precached shell | Home rendered, served from the cached page |
| iPhone 17 Pro simulator, iOS 27, local server stopped                               | Home rendered, served from the precached shell | Home rendered, served from the cached page |
| A page never opened online                                                          | Renders if its data is stored                  | No page; the prototype redirected to Home  |

## Considered Options

- **Complete SSR navigation fallback**: cache each server-rendered page and serve its last copy offline. Only pages opened online work, the cached HTML is a second copy of the Schedule, and each deploy has to drop the cached pages because they point at removed assets.
- **vite-plugin-pwa or @serwist/vite**: neither emits a service worker on TanStack Start with Cloudflare, because both skip generation when `build.ssr` is set, and every environment sets it. The upstream fixes are still open (`docs/research/offline-sync.md`).

## Consequences

What #33 builds:

- **No full SPA mode.** `tanstackStart({ spa: { enabled: true } })` prerenders the shell. The Worker still server-renders every request the service worker doesn't answer, such as the very first visit.
- **Page loads.** Online, the service worker asks the Worker for the shell on every page load with the `X-TSS_SHELL: true` header and `redirect: 'manual'`, so an Access login redirect still reaches the browser. Offline, it serves the precached shell. Prerendered pages (`/options` and each Itinerary's page) are static assets that ignore the header, so they need their own offline answer.
- **TanStack Router #7740 workaround.** On Cloudflare, the prerender runs in workerd, which never sees `TSS_PRERENDERING`, so the shell request renders the full home page with its loader data. The Worker build therefore defines `process.env.TSS_PRERENDERING` as `"true"`, which lets any request with the header get the data-free shell. It deliberately leaves `process.env.TSS_SHELL` undefined: that flag turns every server-rendered request into the shell. The build fails if `_shell.html` carries route loader data, a dehydrated query, or a match below the root route. Drop both once TanStack fixes #7740.
- **The service worker is our own.** It is a custom script on the Serwist runtime (about 12 KB gzip). A `buildApp` post hook builds it after Start's prerender, so the shell exists by then. The hook bundles the script with vite-plus `build()` as an IIFE, defining `process.env.NODE_ENV`, without which the worker fails to start. Serwist's `injectManifest` then precaches the hashed assets, the icons, the manifest and the shell.
- **Data on the device.** The prototype cached server-function reads in the service worker as a stand-in. #33 stores the data instead, and `docs/research/offline-sync.md` recommends TanStack Query persistence in IndexedDB. The first page load is server-rendered before the worker takes control, so its data arrives inside the HTML. The store must keep that hydrated data too; the prototype needed a one-time reload to have Home ready after install.
- **Loaders need an offline path.** The loaders of the Schedule-backed pages (Home, Schedules, each Day, an archived Schedule, the Checklist and the Map) call `fetchQuery` with a zero stale time and set `staleReloadMode: 'blocking'`, so they always wait for fresh data (`src/trip/client/queries.ts`). The Itinerary pages are not part of this: they call their server functions directly and are prerendered. Restoring stored data is not enough on its own: offline, a loader must return the stored data instead of waiting for the network. The prototype hid this because the service worker answered those reads from its cache.
- **Connection status stays out of the worker.** A cached response makes the server-function transport report Connected while offline, and a cache hit after a network timeout hides a late 401. The prototype never cached anything but a 200.
- **One extra round trip online.** A page load through the worker fetches its data after the shell instead of inside the HTML.
