import type { MapMouseEvent } from 'maplibre-gl'
import { MapPinIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import {
  coordinatesOfLngLat,
  lngLatOf,
  TripMapView,
} from '@/components/trip-map-view'
import { MapMarker, MarkerContent, useMap } from '@/components/ui/map'
import type { Coordinates } from '@/trip/domain'

/** The zoom that frames a Pin, about one block across. */
const pinZoom = 16

export interface PinMapProps {
  /** Where the Pin is. */
  pin: Coordinates
  /** Where the map is framed. The map moves there whenever this changes. */
  frame: Coordinates
  /** Moves the Pin after Phillip drags it or taps the map. */
  onMove: (pin: Coordinates) => void
}

/** Moves the map to its frame whenever that changes. */
function Framing({ frame }: { frame: Coordinates }) {
  const { map } = useMap()
  useEffect(() => {
    map?.jumpTo({
      center: lngLatOf(frame),
      zoom: Math.max(map.getZoom(), pinZoom),
    })
  }, [map, frame.latitude, frame.longitude])

  return null
}

/** Tapping the map moves the Pin there. */
function TapToMove({ onMove }: { onMove: (pin: Coordinates) => void }) {
  const { map } = useMap()
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  useEffect(() => {
    if (map === null) return

    const moveTo = ({ lngLat }: MapMouseEvent) =>
      onMoveRef.current(coordinatesOfLngLat(lngLat))

    map.on('click', moveTo)

    return () => {
      map.off('click', moveTo)
    }
  }, [map])

  return null
}

/**
 * The lazily loaded map with one Pin. Phillip drags it, or taps the map, to
 * put it exactly in place.
 */
export default function PinMapCanvas({ pin, frame, onMove }: PinMapProps) {
  return (
    <TripMapView points={[frame]} maxZoom={pinZoom} railAttribution={undefined}>
      <Framing frame={frame} />
      <TapToMove onMove={onMove} />
      <MapMarker
        latitude={pin.latitude}
        longitude={pin.longitude}
        anchor="bottom"
        draggable
        onDragEnd={(lngLat) => onMove(coordinatesOfLngLat(lngLat))}
      >
        <MarkerContent className="cursor-grab active:cursor-grabbing">
          <MapPinIcon
            role="img"
            aria-label="Pin. Drag it into place."
            className="size-10 fill-foreground stroke-background drop-shadow-md"
            strokeWidth={1.5}
          />
        </MarkerContent>
      </MapMarker>
    </TripMapView>
  )
}
