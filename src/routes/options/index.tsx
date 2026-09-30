import { createFileRoute } from '@tanstack/react-router'

import { ItineraryList } from '@/components/itinerary-list'
import { getItineraries } from '@/trip/trip.functions'

export const Route = createFileRoute('/options/')({
  loader: () => getItineraries(),
  head: () => ({ meta: [{ title: 'Options · Japan · December 2026' }] }),
  component: Options,
})

function Options() {
  const itineraries = Route.useLoaderData()
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <h1 className="text-4xl font-semibold md:text-5xl">Options</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The candidate Itineraries for the Trip.
      </p>
      <div className="mt-8">
        <ItineraryList itineraries={itineraries} />
      </div>
    </section>
  )
}
