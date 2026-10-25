// The names the build scripts, the service worker and the app share for
// offline page loads (ADR 0006). The module imports nothing, so the build
// scripts and the worker can both load it.

/** Where the SPA shell is served; the build writes it to `_shell.html`. */
export const shellPath = '/_shell'

/** Asks the Worker for the SPA shell instead of a server-rendered page. */
export const shellHeaders = { 'X-TSS_SHELL': 'true' }

/** Where the service worker is served. */
export const serviceWorkerPath = '/sw.js'

/** The HTML file the build writes for a prerendered page: the shell. */
export const pageFile = (pagePath: string) => `${pagePath}.html`
