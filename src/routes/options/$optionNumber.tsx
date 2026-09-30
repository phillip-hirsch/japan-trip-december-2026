import { createFileRoute, notFound } from '@tanstack/react-router'

import { DayTimeline } from '@/components/day-timeline'
import { StayList } from '@/components/stay-list'
import { parseOptionNumber } from '@/trip/params'
import { getItinerary } from '@/trip/trip.functions'

export const Route = createFileRoute('/options/$optionNumber')({
  params: {
    parse: (params) => {
      const optionNumber = parseOptionNumber(params.optionNumber)
      if (optionNumber === undefined) throw notFound()
      return { optionNumber }
    },
    stringify: ({ optionNumber }) => ({ optionNumber: String(optionNumber) }),
  },
  loader: ({ params: { optionNumber } }) =>
    getItinerary({ data: { optionNumber } }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `Option ${loaderData.optionNumber} · Japan · December 2026` }]
      : [],
  }),
  component: ItineraryPage,
})

function ItineraryPage() {
  const itinerary = Route.useLoaderData()
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <header>
        <h1 className="text-5xl font-semibold md:text-6xl">
          Option {itinerary.optionNumber}
        </h1>
        <p className="mt-3 text-xs tracking-[0.3em] text-muted-foreground uppercase">
          {itinerary.name}
        </p>
      </header>
      <section aria-labelledby="stays" className="mt-12">
        <h2 id="stays" className="mb-4 text-xl font-semibold">
          Stays
        </h2>
        <StayList stays={itinerary.stays} />
      </section>
      <section aria-labelledby="days" className="mt-12">
        <h2 id="days" className="mb-4 text-xl font-semibold">
          Days
        </h2>
        <DayTimeline days={itinerary.days} stays={itinerary.stays} />
      </section>
    </article>
  )
}
