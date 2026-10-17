import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

import { detailTilesPath } from '@/trip/detail-tile-url'

const attribution =
  '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/**
 * Protomaps' dark style, drawn entirely from the app's own origin: the Detail
 * tiles through the Worker, and the glyphs and sprites as static files. Each
 * label shows the English name, with the Japanese one beneath it where the
 * scripts differ.
 */
export const protomapsDark = (origin: string): StyleSpecification => ({
  version: 8,
  glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
  sprite: `${origin}/map/sprites/dark`,
  sources: {
    protomaps: {
      type: 'vector',
      tiles: [`${origin}${detailTilesPath}/{z}/{x}/{y}.mvt`],
      maxzoom: 14,
      attribution,
    },
  },
  layers: layers('protomaps', namedFlavor('dark'), { lang: 'en' }),
})
