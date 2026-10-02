import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'

import { NoSchedule } from '@/components/no-schedule'
import { ScheduleDayView } from '@/components/schedule-day'
import { formatDay, isTripDate } from '@/trip/calendar'
import { parseTripDate } from '@/trip/params'
import { dayQuery } from '@/trip/queries'

// Personal state, so never prerendered: each visit asks the Trip store. The
// date is checked here, in the browser and on the server render alike, and
// again by the server function.
export const Route = createFileRoute('/schedule/$date')({
  params: {
    parse: (params) => {
      const date = parseTripDate(params.date)
      if (date === undefined) throw notFound()
      return { date }
    },
    stringify: ({ date }) => ({ date }),
  },
  loader: {
    handler: ({ context, params: { date } }) =>
      context.queryClient.fetchQuery(dayQuery(date)),
    staleReloadMode: 'blocking',
  },
  // The head still runs for a date the params check refused, so the
  // not-found page keeps the app's title.
  head: ({ params }) => ({
    meta: isTripDate(params.date)
      ? [{ title: `${formatDay(params.date)} · Japan · December 2026` }]
      : [],
  }),
  component: DayPage,
})

function DayPage() {
  const { date } = Route.useParams()
  const page = useSuspenseQuery(dayQuery(date)).data
  if (page === null) return <NoSchedule />
  return <ScheduleDayView page={page} eyebrow="Schedule" />
}
