// Where the Detail tiles come from, shared by the Worker, the map's style and
// the scripts that build and seed the archive. It holds plain values, so
// browser code may import it.

/** The Worker serves each Detail tile at `{z}/{x}/{y}.mvt` under this path. */
export const detailTilesPath = '/tiles/detail'

/** The archive's object in the Worker's R2 bucket. */
export const detailTilesKey = 'detail.pmtiles'

/** The deepest zoom the archive holds. Beyond it, the map enlarges its tiles. */
export const detailTilesMaxZoom = 14
