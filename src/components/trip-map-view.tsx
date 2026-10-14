import { AttributionControl } from 'maplibre-gl'
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

export const coordinatesOfLngLat = ({
  lng,
  lat,
}: {
  readonly lng: number
  readonly lat: number
}): Coordinates => ({ latitude: lat, longitude: lng })

const boundsOf = (points: ReadonlyArray<Coordinates>): LngLatBoundsLike => {
  const longitudes = points.map((point) => point.longitude)
  const latitudes = points.map((point) => point.latitude)

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

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

  const framed = useRef(key)
  useEffect(() => {
    if (map === null || framed.current === key) return
    framed.current = key
    map.fitBounds(boundsOf(points), fitOptionsOf(maxZoom))
  }, [map, key])

  return null
}

export function BaseMarker({ place }: { place: Place }) {
  const { latitude, longitude } = place.coordinates

  // Drawn above Pins so a Pin near the Base never covers its label, and
  // clicked through so the Pin underneath still opens its popup.
  return (
    <MapMarker
      latitude={latitude}
      longitude={longitude}
      className="pointer-events-none z-1"
    >
      <MarkerContent>
        <span className="block size-3 rounded-full bg-foreground ring-2 ring-background" />
        <MarkerLabel className="text-xs [text-shadow:0_0_1px_var(--background),0_0_2px_var(--background),0_0_3px_var(--background),0_0_6px_var(--background)]">
          <PlaceName place={place} />
        </MarkerLabel>
      </MarkerContent>
    </MapMarker>
  )
}

function Attribution({
  railAttribution,
}: {
  railAttribution: string | undefined
}) {
  const { map } = useMap()

  useEffect(() => {
    if (map === null) return

    // Always shown in full, as the map data's licences require.
    const control = new AttributionControl({
      compact: false,
      ...(railAttribution && { customAttribution: railAttribution }),
    })

    map.addControl(control)

    return () => {
      if (map.hasControl(control)) map.removeControl(control)
    }
  }, [map, railAttribution])

  return null
}

export function TripMapView({
  points,
  maxZoom,
  railAttribution,
  fullScreen = false,
  children,
}: {
  points: ReadonlyArray<Coordinates>
  maxZoom?: number
  railAttribution: string | undefined
  fullScreen?: boolean
  children: ReactNode
}) {
  return (
    <MapView
      bounds={boundsOf(points)}
      fitBoundsOptions={fitOptionsOf(maxZoom)}
      cooperativeGestures={!fullScreen}
      attributionControl={false}
    >
      {children}
      {/* Top right, clear of the attribution, which wraps on phones. */}
      <MapControls position="top-right" />
      <Attribution railAttribution={railAttribution} />
    </MapView>
  )
}
