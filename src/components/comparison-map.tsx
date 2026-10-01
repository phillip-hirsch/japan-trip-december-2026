import { lazy } from 'react'
import type { ComponentType } from 'react'

import { LazyMap } from '@/components/lazy-map'

// MapLibre, its styles and the map's data load with their own chunk, which
// the server build never includes: the map renders only in the browser.
const ComparisonMapCanvas: ComponentType = import.meta.env.SSR
  ? () => null
  : lazy(() => import('@/components/comparison-map-canvas'))

/** Every Itinerary's Moves and Bases overlaid on one interactive dark map. */
export function ComparisonMap() {
  return (
    <LazyMap className="lg:aspect-[2/1]">
      <ComparisonMapCanvas />
    </LazyMap>
  )
}
