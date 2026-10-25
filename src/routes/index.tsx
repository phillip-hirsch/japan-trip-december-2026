import { createFileRoute, Link } from '@tanstack/react-router'
import { Match } from 'effect'
import type { ReactNode } from 'react'

import { DisplayJa } from '@/components/display-ja'
import { LastUpdated } from '@/components/last-updated'
import { ScheduleDayView } from '@/components/schedule-day'
import { ScheduleSections } from '@/components/schedule-sections'
import { formatDay, tripEndDate, tripStartDate } from '@/trip/domain/calendar'
import type { HomeState, ScheduleDetail } from '@/trip/domain/domain'
import type { ScreenQuery } from '@/trip/client/last-updated'
import { homeQuery, loadQuery, useHome } from '@/trip/client/queries'

export const Route = createFileRoute('/')({
  loader: {
    handler: ({ context }) => loadQuery(context.queryClient, homeQuery),
    staleReloadMode: 'blocking',
  },
  component: Home,
})

function Home() {
  const { home, query } = useHome()

  return Match.value(home).pipe(
    Match.tagsExhaustive({
      BeforeTrip: (home) => <BeforeTrip home={home} query={query} />,
      DuringTrip: ({ today }) => (
        <ScheduleDayView page={today} eyebrow="Today" query={query} />
      ),
      AfterTrip: ({ schedule }) => (
        <Hero
          eyebrow="After the Trip"
          query={query}
          title={<HeroTitle>Welcome home</HeroTitle>}
          lede="Your Schedule, as a record of the Trip."
        >
          <HomeSchedule schedule={schedule} />
        </Hero>
      ),
    }),
  )
}

function Hero({
  eyebrow,
  query,
  title,
  lede,
  children,
}: {
  eyebrow: string
  /** The query Home's data came from, to show when it was last updated. */
  query: ScreenQuery
  title: ReactNode
  lede: ReactNode
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
        <LastUpdated query={query} className="mt-2" />
        <div className="mt-12">{children}</div>
      </section>
    </div>
  )
}

function HeroTitle({ children }: { children: ReactNode }) {
  return <h1 className="mt-4 text-4xl font-semibold md:text-5xl">{children}</h1>
}

function BeforeTrip({
  home: { daysToGo, schedule },
  query,
}: {
  home: Extract<HomeState, { _tag: 'BeforeTrip' }>
  query: ScreenQuery
}) {
  return (
    <Hero
      eyebrow="Countdown to Tokyo"
      query={query}
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
    >
      <HomeSchedule schedule={schedule} />
    </Hero>
  )
}

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
        {formatDay(tripStartDate)} to {formatDay(tripEndDate)}.{' '}
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
