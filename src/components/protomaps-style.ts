import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

import {
  detailTilesMaxZoom,
  detailTilesPath,
} from '@/trip/detail-tiles/detail-tile-source'

const attribution =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/**
 * Protomaps' dark style, with every request going to the app's own origin.
 * The Worker serves the Detail tiles, and the glyphs and sprites are static
 * files. Each label shows the English name, with the Japanese one beneath it
 * where the scripts differ.
 */
export const protomapsDark = (origin: string): StyleSpecification => ({
  version: 8,
  glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
  sprite: `${origin}/map/sprites/dark`,
  sources: {
    protomaps: {
      type: 'vector',
      tiles: [`${origin}${detailTilesPath}/{z}/{x}/{y}.mvt`],
      maxzoom: detailTilesMaxZoom,
      attribution,
    },
  },
  layers: layers('protomaps', namedFlavor('dark'), { lang: 'en' }),
})
