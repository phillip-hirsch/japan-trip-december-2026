import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { NoSchedule } from '@/components/no-schedule'
import { ScheduleMap } from '@/components/schedule-map'
import { loadQuery, scheduleMapQuery } from '@/trip/client/queries'
import { pageTitle } from '@/lib/app-identity'

const mapViewport = 'h-[calc(100svh-var(--tab-bar-height))] md:h-svh'

export const Route = createFileRoute('/map')({
  loader: {
    handler: ({ context }) => loadQuery(context.queryClient, scheduleMapQuery),
    staleReloadMode: 'blocking',
  },
  head: () => ({ meta: [{ title: pageTitle('Map') }] }),
  component: MapPage,
})

function MapPage() {
  const map = useSuspenseQuery(scheduleMapQuery).data

  if (map === null) return <NoSchedule />

  return (
    <div className={mapViewport}>
      <h1 className="sr-only">Map</h1>
      <ScheduleMap map={map} />
    </div>
  )
}
