import { lazy } from 'react'
import type { ComponentType } from 'react'

import { LazyMap } from '@/components/lazy-map'
import type { PinMapProps } from '@/components/pin-map-canvas'

// MapLibre and its styles form their own chunk, which the server build never
// includes, because the map renders only in the browser.
const PinMapCanvas: ComponentType<PinMapProps> = import.meta.env.SSR
  ? () => null
  : lazy(() => import('@/components/pin-map-canvas'))

/** A Pin on an interactive dark map, to drag into place. */
export function PinMap(props: PinMapProps) {
  return (
    <LazyMap className="aspect-[4/3] sm:aspect-[2/1]">
      <PinMapCanvas {...props} />
    </LazyMap>
  )
}
