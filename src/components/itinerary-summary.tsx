import { StarIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { DisplayJa } from '@/components/display-ja'
import { PlaceName } from '@/components/place-name'
import { cn } from '@/lib/utils'
import { formatNights } from '@/trip/calendar'
import type { ItinerarySummary, Place } from '@/trip/domain'

/** gpt-6-astra's recommendation: a star in the vermilion accent. */
function RecommendationStar({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Recommended by gpt-6-astra"
      title="Recommended by gpt-6-astra"
      className={cn('inline-flex text-primary', className)}
    >
      <StarIcon aria-hidden className="size-full fill-current" />
    </span>
  )
}

/** Each Base in kanji followed by its romaji in parentheses. */
function Route({ route }: { route: ReadonlyArray<Place> }) {
  return (
    <ol className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {route.map((place, index) => (
        // A Base can appear twice, as Tokyo does at both ends.
        <li key={index} className="inline-flex items-baseline gap-2">
          {index > 0 && (
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          )}
          <span className="whitespace-nowrap">
            <DisplayJa text={place.kanji} /> ({place.romaji})
          </span>
        </li>
      ))}
    </ol>
  )
}

function SummaryRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="text-xs tracking-[0.2em] text-muted-foreground uppercase sm:pt-0.5">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * The top of an Itinerary's page: "Option N" with its name beneath, the
 * recommendation star, and its derived summary rows.
 */
export function ItinerarySummaryHeader({
  summary,
  children,
}: {
  summary: ItinerarySummary
  children?: ReactNode
}) {
  return (
    <header>
      <h1 className="flex items-center gap-3 text-5xl font-semibold md:text-6xl">
        Option {summary.optionNumber}
        {summary.recommended && (
          <RecommendationStar className="size-8 md:size-10" />
        )}
      </h1>
      <p className="mt-3 text-xs tracking-[0.3em] text-muted-foreground uppercase">
        {summary.name}
      </p>
      <dl className="mt-8 flex flex-col gap-4 text-sm">
        <SummaryRow label="Best for">{summary.bestFor}</SummaryRow>
        <SummaryRow label="Route">
          <Route route={summary.route} />
        </SummaryRow>
        <SummaryRow label="Nights per Base">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {summary.nightsPerBase.map(({ base, nights }) => (
              <li key={base.id} className="inline-flex items-baseline gap-2">
                <PlaceName place={base} />
                <span className="text-muted-foreground tabular-nums">
                  {formatNights(nights)}
                </span>
              </li>
            ))}
          </ul>
        </SummaryRow>
        <SummaryRow label="New to you">
          {summary.newToYou.length > 0 ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {summary.newToYou.map((place) => (
                <li key={place.id}>
                  <PlaceName place={place} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </SummaryRow>
      </dl>
      {children}
    </header>
  )
}
