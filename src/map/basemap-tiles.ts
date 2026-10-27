import type { AddProtocolAction } from 'maplibre-gl'
import { FileSource, PMTiles } from 'pmtiles'

import { overviewMapPath, overviewMaxZoom } from '@/map/overview-map'
import { detailTilesPath } from '@/trip/detail-tiles/detail-tile-source'

/**
 * The scheme of the map's one vector source. Each of its tiles comes from
 * the Overview map up to its deepest zoom, and from the Detail tiles beyond.
 */
export const basemapScheme = 'basemap'

/** The map style's tile address for the basemap. */
export const basemapTiles = `${basemapScheme}://{z}/{x}/{y}`

const tileAddress = new RegExp(`^${basemapScheme}://(\\d+)/(\\d+)/(\\d+)$`)

let overview: Promise<PMTiles> | undefined

/**
 * The Overview map's archive, read whole once and then through PMTiles' file
 * source, never with range requests. That way the service worker answers it
 * from its precache offline. A failed read is tried again on the next tile.
 */
const overviewArchive = () =>
  (overview ??= fetch(overviewMapPath)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`The Overview map did not load: ${response.status}`)
      }

      const file = new File([await response.blob()], overviewMapPath)

      return new PMTiles(new FileSource(file))
    })
    .catch((error: Error) => {
      overview = undefined
      throw error
    }))

/**
 * Loads one basemap tile for MapLibre. Where the Overview map holds no tile,
 * such as the open sea, an empty array draws an empty tile. A Detail tile
 * fails beyond the boxes, where the Worker answers 204, and offline when the
 * device never kept it, and when the archive is unavailable. MapLibre then
 * keeps drawing the closest zoom it has loaded, such as the Overview map's.
 */
export const loadBasemapTile: AddProtocolAction = async (
  { url },
  { signal },
) => {
  const match = tileAddress.exec(url)

  if (match === null) throw new Error(`Not a basemap tile: ${url}`)
  const [z, x, y] = match.slice(1).map(Number)

  if (z <= overviewMaxZoom) {
    const tile = await (await overviewArchive()).getZxy(z, x, y, signal)

    return { data: new Uint8Array(tile?.data ?? new ArrayBuffer(0)) }
  }

  const response = await fetch(`${detailTilesPath}/${z}/${x}/${y}.mvt`, {
    signal,
  })

  if (response.status !== 200) {
    throw new Error(`No Detail tile: ${response.status}`)
  }

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    cacheControl: response.headers.get('Cache-Control') ?? undefined,
  }
}
