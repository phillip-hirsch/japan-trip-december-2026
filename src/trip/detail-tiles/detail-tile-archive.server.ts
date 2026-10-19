import { env } from 'cloudflare:workers'
import { Layer } from 'effect'
import { EtagMismatch } from 'pmtiles'

import { DetailTileArchive } from '@/trip/detail-tiles/DetailTileArchive'
import { detailTilesKey as key } from '@/trip/detail-tiles/detail-tile-source'

/**
 * Reads the Detail tiles archive from the Worker's R2 bucket. A read that
 * names the etag of an archive since replaced fails with EtagMismatch, so
 * PMTiles drops its cached directories and reads the new archive.
 */
export const detailTileArchive = Layer.succeed(
  DetailTileArchive,
  DetailTileArchive.of({
    getKey: () => key,
    getBytes: async (offset, length, _signal, etag) => {
      const object = await env.DETAIL_TILES.get(key, {
        range: { offset, length },
        ...(etag !== undefined && { onlyIf: { etagMatches: etag } }),
      })

      if (object === null) throw new Error(`The bucket has no ${key}`)

      if (!('body' in object)) throw new EtagMismatch()

      return { data: await object.arrayBuffer(), etag: object.etag }
    },
  }),
)
