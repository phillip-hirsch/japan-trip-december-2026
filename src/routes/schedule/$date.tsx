import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'

import { ScheduleDayView } from '@/components/schedule-day'
import { formatDay, isTripDate } from '@/trip/domain/calendar'
import { parseTripDate } from '@/trip/client/params'
import { dayQuery, loadQuery } from '@/trip/client/queries'
import { pageTitle } from '@/lib/app-identity'

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
      loadQuery(context.queryClient, dayQuery(date)),
    staleReloadMode: 'blocking',
  },
  // The head still runs for a date the params check refused, so the
  // not-found page keeps the app's title.
  head: ({ params }) => ({
    meta: isTripDate(params.date)
      ? [{ title: pageTitle(formatDay(params.date)) }]
      : [],
  }),
  component: DayPage,
})

function DayPage() {
  const { date } = Route.useParams()
  const page = useSuspenseQuery(dayQuery(date)).data

  return (
    <ScheduleDayView page={page} eyebrow="Schedule" query={dayQuery(date)} />
  )
}
