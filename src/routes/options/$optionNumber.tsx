import { createFileRoute, notFound } from '@tanstack/react-router'

import { DayTimeline } from '@/components/day-timeline'
import { ItineraryReasoning } from '@/components/itinerary-reasoning'
import { ItinerarySummaryHeader } from '@/components/itinerary-summary'
import { StayList } from '@/components/stay-list'
import { VerifyClaims } from '@/components/verify-claims'
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
      <ItinerarySummaryHeader summary={itinerary}>
        <VerifyClaims claims={itinerary.verifyClaims} className="mt-6" />
      </ItinerarySummaryHeader>
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
      <section aria-labelledby="reasoning" className="mt-12">
        <h2 id="reasoning" className="mb-4 text-xl font-semibold">
          gpt-6-astra’s reasoning
        </h2>
        <ItineraryReasoning reasoning={itinerary} />
      </section>
    </article>
  )
}
