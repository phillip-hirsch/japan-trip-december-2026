import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { DisplayJa } from '@/components/display-ja'
import { ItineraryList } from '@/components/itinerary-list'
import { ScheduleDayView } from '@/components/schedule-day'
import { ScheduleSections } from '@/components/schedule-sections'
import { cn } from '@/lib/utils'
import { formatDay, tripEndDate, tripStartDate } from '@/trip/calendar'
import type { HomeState, ItinerarySummary, ScheduleDetail } from '@/trip/domain'
import { homeQuery } from '@/trip/queries'

// Personal state, so never prerendered: Home follows the Trip and the
// Schedule, and asks the Trip store on each visit.
export const Route = createFileRoute('/')({
  loader: {
    handler: ({ context }) => context.queryClient.fetchQuery(homeQuery),
    staleReloadMode: 'blocking',
  },
  component: Home,
})

function Home() {
  const home = useSuspenseQuery(homeQuery).data
  switch (home._tag) {
    case 'BeforeTrip':
      return <BeforeTrip home={home} />
    case 'DuringTrip':
      return home.today ? (
        <ScheduleDayView page={home.today} eyebrow="Today" />
      ) : (
        <Hero
          eyebrow="Today"
          title={formatDay(home.date)}
          lede="No Schedule yet. Choose an Itinerary, and Today appears here."
        >
          <HomeItineraries itineraries={home.itineraries} />
        </Hero>
      )
    case 'AfterTrip':
      return (
        <Hero
          eyebrow="After the Trip"
          title="Welcome home"
          lede={
            home.schedule
              ? 'Your Schedule, as a record of the Trip.'
              : 'No Schedule was chosen. The Itineraries are still here.'
          }
          wide={home.schedule !== null}
        >
          {home.schedule ? (
            <HomeSchedule schedule={home.schedule} />
          ) : (
            <HomeItineraries itineraries={home.itineraries} />
          )}
        </Hero>
      )
  }
}

/**
 * Home's hero: an eyebrow, a title and a lede, with the Schedule or the
 * Itineraries below. The glow is capped to the hero's height, and nothing
 * clips, so the content stays reachable on short phones.
 */
function Hero({
  eyebrow,
  title,
  lede,
  wide = false,
  children,
}: {
  eyebrow: string
  title: ReactNode
  lede: ReactNode
  /** Whether the content below spans the hero's width, as the Schedule does. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-112 max-h-full bg-[radial-gradient(ellipse_at_top,oklch(0.3_0.04_255/0.45),transparent_70%)]"
      />
      <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 md:px-12">
        <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        {title}
        <p className="mt-10 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {lede}
        </p>
        <div className={cn('mt-12', !wide && 'max-w-md')}>{children}</div>
      </section>
    </div>
  )
}

function BeforeTrip({
  home: { daysToGo, schedule, itineraries },
}: {
  home: Extract<HomeState, { _tag: 'BeforeTrip' }>
}) {
  return (
    <Hero
      eyebrow="Countdown to Tokyo"
      title={
        <>
          <h1 className="mt-6 flex items-baseline gap-4 font-semibold">
            <span className="text-[clamp(6rem,28vw,11rem)] leading-[0.85] tabular-nums">
              {daysToGo}
            </span>
            <span className="text-2xl md:text-3xl">
              {daysToGo === 1 ? 'day' : 'days'}
            </span>
          </h1>
          <p
            aria-hidden
            className="mt-4 text-2xl text-muted-foreground md:text-3xl"
          >
            <DisplayJa text="あと" />{' '}
            <span className="font-heading tabular-nums">{daysToGo}</span>{' '}
            <DisplayJa text="日" />
          </p>
        </>
      }
      lede={
        <>
          The Trip begins in <DisplayJa text="東京" /> Tokyo at 00:00 on{' '}
          {formatDay(tripStartDate)}.
        </>
      }
      wide={schedule !== null}
    >
      {schedule ? (
        <HomeSchedule schedule={schedule} />
      ) : (
        <HomeItineraries itineraries={itineraries} />
      )}
    </Hero>
  )
}

/** The Itineraries, until Phillip chooses one. */
function HomeItineraries({
  itineraries,
}: {
  itineraries: ReadonlyArray<ItinerarySummary>
}) {
  return (
    <section aria-labelledby="itineraries">
      <h2
        id="itineraries"
        className="mb-4 text-xs tracking-[0.3em] text-muted-foreground uppercase"
      >
        Itineraries
      </h2>
      <ItineraryList itineraries={itineraries} />
    </section>
  )
}

/** Phillip's Schedule: its Stays and Days, each Day opening its own page. */
function HomeSchedule({ schedule }: { schedule: ScheduleDetail }) {
  return (
    <section aria-labelledby="schedule">
      <h2
        id="schedule"
        className="text-xs tracking-[0.3em] text-muted-foreground uppercase"
      >
        Schedule
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        From Option {schedule.sourceOptionNumber}, {formatDay(tripStartDate)} to{' '}
        {formatDay(tripEndDate)}.{' '}
        <Link
          to="/schedule"
          className="text-foreground underline underline-offset-3"
        >
          Open your Schedule
        </Link>
      </p>
      <ScheduleSections schedule={schedule} linkDays />
    </section>
  )
}
