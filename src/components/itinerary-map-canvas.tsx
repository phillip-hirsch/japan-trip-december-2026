import { ItineraryMapLayers, pointsOf } from '@/components/itinerary-map-layers'
import { TripMapView } from '@/components/trip-map-view'
import type { ItineraryMap } from '@/trip/domain'

/**
 * The map itself, loaded lazily: the Itinerary's Bases, Moves and Day trips,
 * framed to fit them all.
 */
export default function ItineraryMapCanvas({ map }: { map: ItineraryMap }) {
  return (
    <TripMapView points={pointsOf(map)} railAttribution={map.railAttribution}>
      <ItineraryMapLayers map={map} />
    </TripMapView>
  )
}
