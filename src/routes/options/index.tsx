import { createFileRoute } from '@tanstack/react-router'

import { ComparisonMap } from '@/components/comparison-map'
import { ComparisonRows } from '@/components/itinerary-comparison'
import { getItineraries } from '@/trip/trip/trip.functions'
import { pageTitle } from '@/lib/app-identity'
import { readPrerenderedPage } from '@/offline/prerendered-page'

export const Route = createFileRoute('/options/')({
  loader: ({ location }) =>
    readPrerenderedPage(location.href, () => getItineraries()),
  head: () => ({ meta: [{ title: pageTitle('Options') }] }),
  component: Options,
})

function Options() {
  const itineraries = Route.useLoaderData()

  return (
    <section className="mx-auto w-full max-w-7xl min-w-0 px-6 py-10 md:px-12 md:py-16">
      <h1 className="text-4xl font-semibold md:text-5xl">Options</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Every Itinerary on the same rows and on one map.
        <span className="xl:hidden"> Swipe to compare.</span>
      </p>
      <div className="mt-8">
        <ComparisonRows itineraries={itineraries} />
      </div>
      <section aria-labelledby="map" className="mt-12">
        <h2 id="map" className="mb-4 text-xl font-semibold">
          Map
        </h2>
        <ComparisonMap />
      </section>
    </section>
  )
}
