/**
 * The app's name, description and background colour, shared by the document
 * head and the web manifest. After changing them, run
 * `vp run build-app-manifest` and commit the regenerated files.
 */
export const appName = 'Japan · December 2026'

/** The label under the Home Screen icon, short enough not to be cut off. */
export const appShortName = 'Japan 2026'

export const appDescription = "Phillip's trip to Japan, December 6–20, 2026."

/** `--ink`, the page background, theme colour and manifest colours. */
export const ink = '#0b1015'

/** A page's document title, the page name followed by the app's name. */
export const pageTitle = (page: string) => `${page} · ${appName}`
