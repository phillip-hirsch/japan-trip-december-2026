# Offline cold start uses a precached SPA shell

With no signal, the installed Home Screen app loads every page from a service worker that answers with TanStack Start's SPA shell, precached by the build and free of loader data, and the page renders from data stored on the device. We chose this over caching each server-rendered page because any page, including a Day not opened recently, renders offline once its data is stored, while cached pages work only where Phillip has already been and break when a deploy removes the assets they point at. Both approaches cold-started offline on Phillip's iPhone on 2026-10-19; the results and screenshots are in #32 and #124, and the prototypes are on the `prototype/offline-cold-start` branch.

## Considered Options

- **Cache each server-rendered page**: works only for pages opened online, keeps its own copy of the Schedule's data inside each page, and has to drop every cached page on each deploy.
- **vite-plugin-pwa or @serwist/vite**: neither emits a service worker on TanStack Start with Cloudflare, and the upstream fixes are still open (`docs/research/offline-sync.md`).

## Consequences

- The app does not switch to full SPA mode. The Worker still server-renders every request the service worker doesn't answer, such as the very first visit. Only the service worker treats the app as an SPA.
- Until TanStack fixes Router #7740, the Worker build defines `process.env.TSS_PRERENDERING` but deliberately not `process.env.TSS_SHELL`, which would turn every page into the shell. The build fails if the shell carries loader data.
- The service worker is our own script on the Serwist runtime, built by a hook after Start's prerender.
- Each online page load takes one extra round trip, because data now arrives after the shell instead of inside the HTML.
- The Schedule-backed page loaders always wait for fresh data, so #33 has to give them an offline path. #33's implementation notes are in its issue.
