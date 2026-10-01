import type { LngLatBoundsLike } from 'maplibre-gl'
import type { ReactNode } from 'react'

import { PlaceName } from '@/components/place-name'
import {
  Map as MapView,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
} from '@/components/ui/map'
import type { Coordinates, Place } from '@/trip/domain'

// What every map of the Trip shares. It brings MapLibre along, so only the
// lazily loaded map canvases import it.

export const lngLatOf = ({
  longitude,
  latitude,
}: Coordinates): [number, number] => [longitude, latitude]

/** The smallest box around every point, as [south-west, north-east]. */
const boundsOf = (points: ReadonlyArray<Coordinates>): LngLatBoundsLike => {
  const longitudes = points.map((point) => point.longitude)
  const latitudes = points.map((point) => point.latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

/** A Base: a point with its name always shown. */
export function BaseMarker({ place }: { place: Place }) {
  const { latitude, longitude } = place.coordinates
  return (
    <MapMarker latitude={latitude} longitude={longitude}>
      <MarkerContent className="cursor-default">
        <span className="block size-3 rounded-full bg-foreground ring-2 ring-background" />
        <MarkerLabel className="text-xs [text-shadow:0_0_3px_var(--background),0_0_6px_var(--background)]">
          <PlaceName place={place} />
        </MarkerLabel>
      </MarkerContent>
    </MapMarker>
  )
}

/**
 * A dark map framed to fit every point, with its attributions always shown
 * in full and zoom controls. Gestures are cooperative so the page still
 * scrolls past the map.
 */
export function TripMapView({
  points,
  railAttribution,
  children,
}: {
  points: ReadonlyArray<Coordinates>
  /** The rail geometry's credit, when the map follows a rail line. */
  railAttribution: string | undefined
  children: ReactNode
}) {
  return (
    <MapView
      bounds={boundsOf(points)}
      fitBoundsOptions={{ padding: 48 }}
      cooperativeGestures
      // Always shown in full, as the map data's licences require.
      attributionControl={{
        compact: false,
        ...(railAttribution && { customAttribution: railAttribution }),
      }}
    >
      {children}
      {/* Top right, clear of the attribution, which wraps on phones. */}
      <MapControls position="top-right" />
    </MapView>
  )
}
