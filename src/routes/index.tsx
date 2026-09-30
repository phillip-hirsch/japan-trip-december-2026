import { createFileRoute } from '@tanstack/react-router'

import { DisplayJa } from '@/components/display-ja'
import { ItineraryList } from '@/components/itinerary-list'
import { formatDay, tripStartDate } from '@/trip/calendar'
import { getHome } from '@/trip/trip.functions'

export const Route = createFileRoute('/')({
  loader: () => getHome(),
  component: Home,
})

function Home() {
  const { countdown, itineraries } = Route.useLoaderData()
  return (
    // No overflow clipping here: the hero grows with its content (the
    // Itineraries list must stay reachable on short phones), and the glow is
    // capped to the hero's height instead.
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-112 max-h-full bg-[radial-gradient(ellipse_at_top,oklch(0.3_0.04_255/0.45),transparent_70%)]"
      />
      <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 md:px-12">
        <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          Countdown to Tokyo
        </p>
        {countdown._tag === 'Counting' ? (
          <>
            <h1 className="mt-6 flex items-baseline gap-4 font-semibold">
              <span className="text-[clamp(6rem,28vw,11rem)] leading-[0.85] tabular-nums">
                {countdown.days}
              </span>
              <span className="text-2xl md:text-3xl">
                {countdown.days === 1 ? 'day' : 'days'}
              </span>
            </h1>
            <p
              aria-hidden
              className="mt-4 text-2xl text-muted-foreground md:text-3xl"
            >
              <DisplayJa text="あと" />{' '}
              <span className="font-heading tabular-nums">
                {countdown.days}
              </span>{' '}
              <DisplayJa text="日" />
            </p>
          </>
        ) : (
          <h1 className="mt-6 text-5xl font-semibold md:text-6xl">
            The countdown is over
          </h1>
        )}
        <p className="mt-10 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The Trip begins in <DisplayJa text="東京" /> Tokyo at 00:00 on{' '}
          {formatDay(tripStartDate)}.
        </p>
        <section aria-labelledby="itineraries" className="mt-12 max-w-md">
          <h2
            id="itineraries"
            className="mb-4 text-xs tracking-[0.3em] text-muted-foreground uppercase"
          >
            Itineraries
          </h2>
          <ItineraryList itineraries={itineraries} />
        </section>
      </section>
    </div>
  )
}
