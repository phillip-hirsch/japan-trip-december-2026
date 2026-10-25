import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { LastUpdated } from '@/components/last-updated'
import { TripNote } from '@/components/notes'
import { AnchorWarnings } from '@/components/schedule-rules'
import {
  ArchivedScheduleList,
  RevisionNotice,
  ScheduleSections,
} from '@/components/schedule-sections'
import { VerifyClaims } from '@/components/verify-claims'
import { formatMoment } from '@/trip/domain/calendar'
import { loadQuery, schedulesQuery } from '@/trip/client/queries'
import { pageTitle } from '@/lib/app-identity'

export const Route = createFileRoute('/schedule/')({
  loader: {
    handler: ({ context }) => loadQuery(context.queryClient, schedulesQuery),
    staleReloadMode: 'blocking',
  },
  head: () => ({ meta: [{ title: pageTitle('Schedule') }] }),
  component: SchedulePage,
})

function SchedulePage() {
  const {
    current: schedule,
    archived,
    tripNote,
  } = useSuspenseQuery(schedulesQuery).data

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <header>
        <h1 className="text-5xl font-semibold md:text-6xl">Schedule</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Copied from Option {schedule.sourceOptionNumber} on{' '}
          <time dateTime={schedule.chosenAt}>
            {formatMoment(schedule.chosenAt)}
          </time>
          .{' '}
          <Link
            to="/options"
            className="text-foreground underline underline-offset-3"
          >
            See the Itineraries
          </Link>
        </p>
        <LastUpdated query={schedulesQuery} className="mt-2" />
        <AnchorWarnings warnings={schedule.anchorWarnings} className="mt-6" />
        <RevisionNotice schedule={schedule} className="mt-6" />
        <VerifyClaims claims={schedule.verifyClaims} className="mt-6" />
      </header>
      <section aria-labelledby="trip-note" className="mt-12">
        <h2 id="trip-note" className="mb-4 text-xl font-semibold">
          Trip note
        </h2>
        <TripNote note={tripNote} labelledBy="trip-note" />
      </section>
      <ScheduleSections schedule={schedule} linkDays />
      <ArchivedScheduleList schedules={archived} />
    </article>
  )
}
