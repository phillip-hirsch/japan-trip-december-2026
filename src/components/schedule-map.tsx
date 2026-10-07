import { lazy } from 'react'
import type { ComponentType } from 'react'

import { LazyMap } from '@/components/lazy-map'
import type { ScheduleMap as ScheduleMapData } from '@/trip/domain'

// MapLibre and its styles form their own chunk, which the server build never
// includes: the map renders only in the browser.
const ScheduleMapCanvas: ComponentType<{ map: ScheduleMapData }> = import.meta
  .env.SSR
  ? () => null
  : lazy(() => import('@/components/schedule-map-canvas'))

/**
 * The Schedule's Bases, Moves, Day trips and pinned places on an interactive
 * dark map that fills its container.
 */
export function ScheduleMap({ map }: { map: ScheduleMapData }) {
  return (
    <LazyMap className="h-full aspect-auto rounded-none border-0 sm:aspect-auto">
      <ScheduleMapCanvas map={map} />
    </LazyMap>
  )
}
