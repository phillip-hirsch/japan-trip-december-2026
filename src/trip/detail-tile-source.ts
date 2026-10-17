// Where the Detail tiles come from, shared by the Worker, the map's style and
// the scripts that build and seed the archive. Plain values, so it's
// browser-safe.

/** The Worker serves each Detail tile at `{z}/{x}/{y}.mvt` under this path. */
export const detailTilesPath = '/tiles/detail'

/** The archive's object in the Worker's R2 bucket. */
export const detailTilesKey = 'detail.pmtiles'

/** The deepest zoom the archive holds; the map stretches it beyond. */
export const detailTilesMaxZoom = 14
