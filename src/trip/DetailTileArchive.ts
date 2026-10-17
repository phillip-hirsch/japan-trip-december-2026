import { Context } from 'effect'
import type { Source } from 'pmtiles'

/**
 * Where the Trip service reads the Detail tiles: one PMTiles archive, read by
 * byte range. The Worker reads it from its R2 bucket
 * (`detail-tile-archive.server.ts`); tests read a small archive from memory.
 */
export class DetailTileArchive extends Context.Service<
  DetailTileArchive,
  Source
>()('japan-trip/trip/DetailTileArchive') {}
