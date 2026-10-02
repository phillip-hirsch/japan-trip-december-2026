import { ButtonLink } from '@/components/button-link'

/** The empty state of a page that needs a Schedule, before one is chosen. */
export function NoSchedule() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 md:px-12">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
        Schedule
      </p>
      <h1 className="mt-4 text-4xl font-semibold md:text-5xl">
        No Schedule yet
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Your Schedule starts as a copy of the Itinerary you choose. Compare the
        Itineraries, then choose one from its page.
      </p>
      <div className="mt-8 flex gap-2">
        <ButtonLink to="/options">Compare the Itineraries</ButtonLink>
      </div>
    </section>
  )
}
