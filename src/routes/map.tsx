import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { LastUpdated } from '@/components/last-updated'
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
    <div className={`relative ${mapViewport}`}>
      <h1 className="sr-only">Map</h1>
      <ScheduleMap map={map} />
      {/* Bottom left, where the offline banner never covers it. On narrower
          maps it sits above the attribution, which wraps across them. */}
      <LastUpdated
        query={scheduleMapQuery}
        className="absolute bottom-16 left-2.5 z-10 rounded-md border bg-background px-2 py-1 shadow-sm lg:bottom-2.5"
      />
    </div>
  )
}
