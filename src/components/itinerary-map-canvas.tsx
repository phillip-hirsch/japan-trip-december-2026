import { ItineraryMapLayers, pointsOf } from '@/components/itinerary-map-layers'
import { TripMapView } from '@/components/trip-map-view'
import type { ItineraryMap } from '@/trip/domain'

export default function ItineraryMapCanvas({ map }: { map: ItineraryMap }) {
  return (
    <TripMapView points={pointsOf(map)} railAttribution={map.railAttribution}>
      <ItineraryMapLayers map={map} />
    </TripMapView>
  )
}
