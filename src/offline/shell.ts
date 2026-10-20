// What the build, the service worker and the app agree on about offline page
// loads (ADR 0006). No imports, so the build scripts and the worker can share
// it.

/** Where the SPA shell is served; the build writes it to `_shell.html`. */
export const shellPath = '/_shell'

/** Asks the Worker for the SPA shell instead of a server-rendered page. */
export const shellHeaders = { 'X-TSS_SHELL': 'true' }

/** Where the service worker is served. */
export const serviceWorkerPath = '/sw.js'

/** The HTML file the build writes for a prerendered page, such as the shell. */
export const pageFile = (pagePath: string) => `${pagePath}.html`

/**
 * The page a path names: `/options/2/` and `/options/2.html` are both
 * `/options/2`, where static assets redirect them online.
 */
export const pagePath = (pathname: string) =>
  pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/'
