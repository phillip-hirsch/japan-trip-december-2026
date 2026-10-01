import { Link } from '@tanstack/react-router'
import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import {
  NewToYou,
  NightsPerBase,
  RecommendationStar,
  RouteBases,
} from '@/components/itinerary-summary'
import { OptionalBadge } from '@/components/optional-badge'
import { PlaceName } from '@/components/place-name'
import { cn } from '@/lib/utils'
import {
  formatDurationRange,
  formatNights,
  formatShortDate,
} from '@/trip/calendar'
import type {
  ItineraryComparison,
  MovesComparison,
  MoveSummary,
} from '@/trip/domain'

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

/** A Move's Bases as "Fukuoka → Tokyo". */
function MoveBases({ move }: { move: MoveSummary }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <PlaceName place={move.from} />
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <span className="sr-only">to</span>
      <PlaceName place={move.to} />
    </span>
  )
}

function Moves({ moves }: { moves: MovesComparison }) {
  if (moves.count === 0) return <Muted>No Moves</Muted>
  return (
    <div className="flex flex-col gap-1">
      <p>
        {moves.count} {moves.count === 1 ? 'Move' : 'Moves'}
        {moves.travelTime && (
          <Muted> · {formatDurationRange(moves.travelTime)} travelling</Muted>
        )}
      </p>
      {moves.durationNotGiven.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {moves.durationNotGiven.map((move) => (
            <li key={move.date}>
              <MoveBases move={move} /> {move.mode} on{' '}
              {formatShortDate(move.date)}: duration not given, so not counted
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThursdayBackup({ backup }: { backup: boolean }) {
  const Icon = backup ? CheckIcon : XIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        !backup && 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {backup ? 'Yes, all of Thursday in Kyoto' : 'No'}
    </span>
  )
}

function DayTrips({ dayTrips }: { dayTrips: ItineraryComparison['dayTrips'] }) {
  if (dayTrips.length === 0) return <Muted>None</Muted>
  return (
    <ul className="flex flex-col gap-1">
      {dayTrips.map(({ place, optional }) => (
        <li key={place.id} className="flex flex-wrap items-center gap-1.5">
          <PlaceName place={place} />
          {optional && <OptionalBadge />}
        </li>
      ))}
    </ul>
  )
}

function FlightsAndRyokan({
  flights,
  ryokanStays,
}: Pick<ItineraryComparison, 'flights' | 'ryokanStays'>) {
  if (flights.length === 0 && ryokanStays.length === 0) {
    return <Muted>None</Muted>
  }
  return (
    <ul className="flex flex-col gap-1">
      {flights.map((flight) => (
        <li key={flight.date}>
          Flight <MoveBases move={flight} />{' '}
          <Muted>on {formatShortDate(flight.date)}</Muted>
        </li>
      ))}
      {ryokanStays.map((stay) => (
        <li key={stay.checkIn}>
          Ryokan in <PlaceName place={stay.base} />{' '}
          <Muted>
            {formatShortDate(stay.checkIn)} – {formatShortDate(stay.checkOut)},{' '}
            {formatNights(stay.nights)}
          </Muted>
        </li>
      ))}
    </ul>
  )
}

/** The comparison rows, in order: every Itinerary shows each one. */
const rows: ReadonlyArray<{
  label: string
  render: (itinerary: ItineraryComparison) => ReactNode
}> = [
  { label: 'Best for', render: (itinerary) => itinerary.bestFor },
  {
    label: 'Route',
    render: (itinerary) => <RouteBases route={itinerary.route} />,
  },
  {
    label: 'Nights per Base',
    render: (itinerary) => (
      <NightsPerBase nightsPerBase={itinerary.nightsPerBase} />
    ),
  },
  {
    label: 'New to you',
    render: (itinerary) => <NewToYou places={itinerary.newToYou} />,
  },
  {
    label: 'Birthday',
    render: ({ birthday }) => (
      <div className="flex flex-col gap-1">
        {birthday.base && <PlaceName place={birthday.base} />}
        <p className="text-muted-foreground">{birthday.outline}</p>
      </div>
    ),
  },
  { label: 'Moves', render: (itinerary) => <Moves moves={itinerary.moves} /> },
  {
    label: 'Thursday backup for Shigeharu',
    render: (itinerary) => <ThursdayBackup backup={itinerary.thursdayBackup} />,
  },
  {
    label: 'Day trips',
    render: (itinerary) => <DayTrips dayTrips={itinerary.dayTrips} />,
  },
  {
    label: 'Flights and ryokan',
    render: (itinerary) => <FlightsAndRyokan {...itinerary} />,
  },
  {
    label: 'Recommendation',
    render: (itinerary) =>
      itinerary.recommended ? (
        <span className="inline-flex items-center gap-1.5">
          <RecommendationStar className="size-4" />
          <span aria-hidden>Recommended</span>
        </span>
      ) : (
        <Muted>
          <span aria-hidden>—</span>
          <span className="sr-only">Not recommended</span>
        </Muted>
      ),
  },
]

const rowClassName = 'border-t border-border/60 pt-3'

const labelClassName =
  'text-xs tracking-[0.2em] text-muted-foreground uppercase'

function ItineraryCard({ itinerary }: { itinerary: ItineraryComparison }) {
  const headingId = `option-${itinerary.optionNumber}`
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'flex w-[85%] max-w-sm shrink-0 snap-center flex-col gap-3 rounded-xl border bg-card p-4 text-sm',
        'xl:row-span-(--card-rows) xl:grid xl:w-auto xl:max-w-none xl:grid-rows-subgrid',
        itinerary.recommended && 'border-primary/40',
      )}
    >
      <Link
        to="/options/$optionNumber"
        params={{ optionNumber: itinerary.optionNumber }}
        className="group flex items-start justify-between gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span>
          <h2 id={headingId} className="text-2xl font-semibold">
            Option {itinerary.optionNumber}
          </h2>
          <span className="mt-1 block text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {itinerary.name}
          </span>
        </span>
        <ChevronRightIcon
          aria-hidden
          className="mt-1.5 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </Link>
      <dl className="flex flex-col gap-3 xl:row-span-(--rows) xl:grid xl:grid-rows-subgrid">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn('flex flex-col gap-1', rowClassName)}
          >
            {/* On desktop the label column names the row instead. */}
            <dt className={cn(labelClassName, 'xl:sr-only')}>{row.label}</dt>
            <dd>{row.render(itinerary)}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

/**
 * Every Itinerary on the same rows: swipeable cards on a phone, side-by-side
 * columns on a desktop, with one label column shared by every row.
 */
export function ComparisonRows({
  itineraries,
}: {
  itineraries: ReadonlyArray<ItineraryComparison>
}) {
  return (
    <div
      style={
        {
          '--columns': itineraries.length,
          '--rows': rows.length,
          '--card-rows': rows.length + 1,
        } as CSSProperties
      }
      className="relative -mx-6 flex items-start snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-4 md:-mx-12 md:scroll-px-12 md:px-12 xl:mx-0 xl:grid xl:items-stretch xl:snap-none xl:grid-cols-[9rem_repeat(var(--columns),minmax(11rem,1fr))] xl:gap-x-4 xl:gap-y-3 xl:px-0"
    >
      <div
        aria-hidden
        className="hidden xl:row-span-(--card-rows) xl:grid xl:grid-rows-subgrid"
      >
        <span />
        {rows.map((row) => (
          <span key={row.label} className={cn(labelClassName, rowClassName)}>
            {row.label}
          </span>
        ))}
      </div>
      {itineraries.map((itinerary) => (
        <ItineraryCard key={itinerary.optionNumber} itinerary={itinerary} />
      ))}
    </div>
  )
}
