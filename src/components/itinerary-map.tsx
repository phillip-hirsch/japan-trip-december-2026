import { lazy } from 'react'
import type { ComponentType } from 'react'

import { LazyMap } from '@/components/lazy-map'
import type { ItineraryMap as ItineraryMapData } from '@/trip/domain'

// MapLibre and its styles form their own chunk, which the server build never
// includes: the map renders only in the browser.
const ItineraryMapCanvas: ComponentType<{ map: ItineraryMapData }> = import.meta
  .env.SSR
  ? () => null
  : lazy(() => import('@/components/itinerary-map-canvas'))

/** An Itinerary's Bases, Moves and Day trips on an interactive dark map. */
export function ItineraryMap({ map }: { map: ItineraryMapData }) {
  return (
    <LazyMap>
      <ItineraryMapCanvas map={map} />
    </LazyMap>
  )
}
