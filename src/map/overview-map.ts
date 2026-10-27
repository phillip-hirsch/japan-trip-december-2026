// Where the Overview map comes from, shared by the map, the service worker
// build and the script that extracts the archive. It imports nothing, so plain
// `node` can load it.

/** Where the app serves the Overview map's archive, a static file. */
// Outside public/map, which `vp run build-map-assets` replaces whole.
export const overviewMapPath = '/overview.pmtiles'

/** The deepest zoom the Overview map holds. Closer in, the Detail tiles draw. */
export const overviewMaxZoom = 8
