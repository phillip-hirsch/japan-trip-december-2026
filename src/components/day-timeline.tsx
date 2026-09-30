import { ArrowRightIcon, LuggageIcon } from 'lucide-react'

import { PlaceName } from '@/components/place-name'
import { Badge } from '@/components/ui/badge'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
} from '@/components/ui/item'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  formatDay,
  formatDayOfMonth,
  formatNights,
  formatWeekday,
} from '@/trip/calendar'
import type { Anchor, DayDetail, StayDetail } from '@/trip/domain'

const anchorBadges: Record<
  Anchor['_tag'],
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  Arrival: { label: 'Arrival', variant: 'secondary' },
  ShigeharuVisit: { label: 'Shigeharu', variant: 'outline' },
  Birthday: { label: 'Birthday', variant: 'default' },
  Departure: { label: 'Departure', variant: 'secondary' },
}

function AnchorNote({ anchor }: { anchor: Anchor }) {
  if (anchor._tag !== 'ShigeharuVisit') return null
  return (
    <p className="text-xs text-muted-foreground">
      Tentative, in the {anchor.slot}
      {anchor.thursdayBackup && ', with Thursday morning as a backup'}.
    </p>
  )
}

function DayItem({ day }: { day: DayDetail }) {
  const birthday = day.anchors.some((anchor) => anchor._tag === 'Birthday')
  return (
    <Item
      size="sm"
      className={cn(
        'items-start',
        birthday && 'border-primary/40 bg-primary/10',
      )}
    >
      <ItemMedia className="w-10 flex-col items-center gap-0 self-start">
        <time dateTime={day.date} className="flex flex-col items-center">
          <span className="sr-only">{formatDay(day.date)}</span>
          <span
            aria-hidden
            className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase"
          >
            {formatWeekday(day.date)}
          </span>
          <span
            aria-hidden
            className={cn(
              'font-heading text-2xl leading-none tabular-nums',
              birthday && 'text-primary',
            )}
          >
            {formatDayOfMonth(day.date)}
          </span>
        </time>
      </ItemMedia>
      <ItemContent className="gap-1.5">
        {(day.anchors.length > 0 || day.freeDay) && (
          <div className="flex flex-wrap gap-1.5">
            {day.anchors.map((anchor) => {
              const badge = anchorBadges[anchor._tag]
              return (
                <Badge
                  key={anchor._tag}
                  variant={badge.variant}
                  className={cn(
                    anchor._tag === 'ShigeharuVisit' && 'border-dashed',
                  )}
                >
                  {badge.label}
                </Badge>
              )
            })}
            {day.freeDay && (
              <Badge
                variant="outline"
                className="border-dashed text-muted-foreground"
              >
                Free day
              </Badge>
            )}
          </div>
        )}
        {day.anchors.map((anchor) => (
          <AnchorNote key={anchor._tag} anchor={anchor} />
        ))}
        {day.move && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <LuggageIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Move</span>
            <PlaceName place={day.move.from} />
            <ArrowRightIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden
            />
            <span className="sr-only">to</span>
            <PlaceName place={day.move.to} />
          </p>
        )}
        {day.description !== undefined && (
          <ItemDescription className="line-clamp-none text-foreground">
            {day.description}
          </ItemDescription>
        )}
      </ItemContent>
    </Item>
  )
}

/**
 * All 15 Days as one timeline, under a marker for each Stay they fall in. The
 * Days are sections of the Itinerary page, each addressable by its date.
 */
export function DayTimeline({
  days,
  stays,
}: {
  days: ReadonlyArray<DayDetail>
  stays: ReadonlyArray<StayDetail>
}) {
  // Each Day sits under the latest Stay that has checked in by then, so a
  // Move day opens the Stay it moves to and Departure closes the last one.
  const sections = stays.map((stay, index) => {
    const next = stays[index + 1]
    return {
      stay,
      days: days.filter(
        (day) =>
          day.date >= stay.checkIn &&
          (next === undefined || day.date < next.checkIn),
      ),
    }
  })
  return (
    <div className="flex flex-col gap-6">
      {sections.map(({ stay, days }) => (
        <section key={stay.checkIn} aria-label={stay.base.romaji}>
          <Marker variant="separator" className="mb-2 text-xs">
            <MarkerContent className="flex items-baseline gap-2">
              <PlaceName place={stay.base} className="text-foreground" />
              <span>· {formatNights(stay.nights)}</span>
            </MarkerContent>
          </Marker>
          <ol>
            {days.map((day, index) => (
              <li key={day.date} id={day.date} className="scroll-mt-4">
                {index > 0 && <Separator className="my-1" />}
                <DayItem day={day} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
