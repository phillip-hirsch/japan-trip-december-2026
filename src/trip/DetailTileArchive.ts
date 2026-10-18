import { Context } from 'effect'
import type { Source } from 'pmtiles'

/**
 * The one PMTiles archive the Trip service reads the Detail tiles from, by
 * byte range. The Worker reads it from its R2 bucket, in
 * `detail-tile-archive.server.ts`. Tests read a small archive from memory.
 */
export class DetailTileArchive extends Context.Service<
  DetailTileArchive,
  Source
>()('japan-trip/trip/DetailTileArchive') {}
