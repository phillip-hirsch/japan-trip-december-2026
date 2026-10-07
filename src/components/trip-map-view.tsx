import type { LngLatBoundsLike } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { PlaceName } from '@/components/place-name'
import {
  Map as MapView,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  useMap,
} from '@/components/ui/map'
import type { Coordinates, Place } from '@/trip/domain'

// What every map of the Trip shares. It brings MapLibre along, so only the
// lazily loaded map canvases import it.

export const lngLatOf = ({
  longitude,
  latitude,
}: Coordinates): [number, number] => [longitude, latitude]

/** Coordinates from MapLibre's longitude and latitude, as dragged or tapped. */
export const coordinatesOfLngLat = ({
  lng,
  lat,
}: {
  readonly lng: number
  readonly lat: number
}): Coordinates => ({ latitude: lat, longitude: lng })

/** The smallest box around every point, as [south-west, north-east]. */
const boundsOf = (points: ReadonlyArray<Coordinates>): LngLatBoundsLike => {
  const longitudes = points.map((point) => point.longitude)
  const latitudes = points.map((point) => point.latitude)

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

/** How a map frames its points, closest at the zoom given. */
const fitOptionsOf = (maxZoom: number | undefined) => ({
  padding: 48,
  ...(maxZoom !== undefined && { maxZoom }),
})

/**
 * Frames the map again whenever any of its points changes, such as when a
 * refetch brings a pin added or moved on another device, wherever it is. The
 * same points arriving again, in any order, such as after Activities are
 * reordered, leave the map where Phillip moved it.
 */
export function FitToPoints({
  points,
  maxZoom,
}: {
  points: ReadonlyArray<Coordinates>
  maxZoom?: number
}) {
  const { map } = useMap()

  const key = points
    .map(({ latitude, longitude }) => `${latitude},${longitude}`)
    .sort()
    .join(' ')

  // The map opens framed to the first points.
  const framed = useRef(key)
  useEffect(() => {
    if (map === null || framed.current === key) return
    framed.current = key
    map.fitBounds(boundsOf(points), fitOptionsOf(maxZoom))
  }, [map, key])

  return null
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
 * in full and zoom controls. Gestures are cooperative unless it fills the
 * screen, so a page still scrolls past the map.
 */
export function TripMapView({
  points,
  maxZoom,
  railAttribution,
  fullScreen = false,
  children,
}: {
  points: ReadonlyArray<Coordinates>
  /** The closest the framing zooms in, such as for a single point. */
  maxZoom?: number
  /** The rail geometry's credit, when the map follows a rail line. */
  railAttribution: string | undefined
  /** Whether the map is the whole page, with nothing to scroll past. */
  fullScreen?: boolean
  children: ReactNode
}) {
  return (
    <MapView
      bounds={boundsOf(points)}
      fitBoundsOptions={fitOptionsOf(maxZoom)}
      cooperativeGestures={!fullScreen}
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
