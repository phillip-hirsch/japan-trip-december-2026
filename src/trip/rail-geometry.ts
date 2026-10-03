// Plain data, no Effect. `vp run build-rail-geometry` rebuilds the GeoJSON
// from MLIT's National Land Numerical Information railway data (N02, FY2025
// edition, CC BY 4.0).
import type { Coordinates } from '@/trip/domain'
import { railSectionKey } from '@/trip/rail'
import type { RailSectionIds } from '@/trip/rail'
import railGeometry from '@/trip/rail-geometry.json'

/** The credit MLIT's licence requires wherever the rail geometry is shown. */
export const railGeometryAttribution =
  '「国土数値情報（鉄道データ）」（国土交通省）を加工して作成'

const featuresByKey = new Map(
  railGeometry.features.map((feature) => [feature.id, feature]),
)

/**
 * A rail section's path along its real line, from its from-station to its
 * to-station, or undefined when the rail geometry lacks it.
 */
export const railGeometryOf = (
  section: RailSectionIds,
): Array<Coordinates> | undefined => {
  const feature = featuresByKey.get(railSectionKey(section))

  if (feature === undefined) return undefined

  const path = feature.geometry.coordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }))

  return feature.properties.from === section.from ? path : path.reverse()
}
