import type { MapMouseEvent } from 'maplibre-gl'
import { MapPinIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import {
  coordinatesOfLngLat,
  lngLatOf,
  TripMapView,
} from '@/components/trip-map-view'
import { MapMarker, MarkerContent, useMap } from '@/components/ui/map'
import type { Coordinates } from '@/trip/domain/domain'

const oneBlockZoom = 16

export interface PinMapProps {
  pin: Coordinates
  frame: Coordinates
  onMove: (pin: Coordinates) => void
}

function Framing({ frame }: { frame: Coordinates }) {
  const { map } = useMap()
  useEffect(() => {
    map?.jumpTo({
      center: lngLatOf(frame),
      zoom: Math.max(map.getZoom(), oneBlockZoom),
    })
  }, [map, frame.latitude, frame.longitude])

  return null
}

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

export default function PinMapCanvas({ pin, frame, onMove }: PinMapProps) {
  return (
    <TripMapView
      points={[frame]}
      maxZoom={oneBlockZoom}
      railAttribution={undefined}
    >
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
