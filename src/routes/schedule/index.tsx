import { createFileRoute, Link } from '@tanstack/react-router'

import { DayTimeline } from '@/components/day-timeline'
import { NoSchedule } from '@/components/no-schedule'
import { StayList } from '@/components/stay-list'
import { VerifyClaims } from '@/components/verify-claims'
import { formatChosenAt } from '@/trip/calendar'
import { getSchedule } from '@/trip/trip.functions'

// Personal state, so never prerendered: each visit asks the Trip store.
export const Route = createFileRoute('/schedule/')({
  loader: () => getSchedule(),
  head: () => ({ meta: [{ title: 'Schedule · Japan · December 2026' }] }),
  component: SchedulePage,
})

function SchedulePage() {
  const schedule = Route.useLoaderData()
  if (schedule === null) return <NoSchedule />
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <header>
        <h1 className="text-5xl font-semibold md:text-6xl">Schedule</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Copied from Option {schedule.sourceOptionNumber} on{' '}
          <time dateTime={schedule.chosenAt}>
            {formatChosenAt(schedule.chosenAt)}
          </time>
          .{' '}
          <Link
            to="/options"
            className="text-foreground underline underline-offset-3"
          >
            See the Itineraries
          </Link>
        </p>
        <VerifyClaims claims={schedule.verifyClaims} className="mt-6" />
      </header>
      <section aria-labelledby="stays" className="mt-12">
        <h2 id="stays" className="mb-4 text-xl font-semibold">
          Stays
        </h2>
        <StayList stays={schedule.stays} />
      </section>
      <section aria-labelledby="days" className="mt-12">
        <h2 id="days" className="mb-4 text-xl font-semibold">
          Days
        </h2>
        <DayTimeline days={schedule.days} stays={schedule.stays} />
      </section>
    </article>
  )
}
