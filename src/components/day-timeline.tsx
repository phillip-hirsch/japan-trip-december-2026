import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'

import {
  AnchorBadges,
  AnchorNotes,
  DayTripLine,
  isBirthday,
  MoveRoute,
  MoveTravel,
} from '@/components/day-details'
import type { NoDuration } from '@/components/day-details'
import { PlaceName } from '@/components/place-name'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
} from '@/components/ui/item'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Separator } from '@/components/ui/separator'
import { VerifyClaims } from '@/components/verify-claims'
import { cn } from '@/lib/utils'
import {
  formatDay,
  formatDayOfMonth,
  formatNights,
  formatWeekday,
} from '@/trip/calendar'
import type { DayDetail, StayDetail } from '@/trip/domain'

/** A Day, opening its own page when the timeline links its Days. */
function DayItem({
  day,
  linked,
  noDuration,
}: {
  day: DayDetail
  linked: boolean
  noDuration?: NoDuration
}) {
  const birthday = isBirthday(day.anchors)

  return (
    <Item
      size="sm"
      className={cn(
        'items-start',
        birthday && 'border-primary/40 bg-primary/10',
      )}
      render={
        linked ? (
          <Link to="/schedule/$date" params={{ date: day.date }} />
        ) : undefined
      }
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
        <AnchorBadges anchors={day.anchors} freeDay={day.freeDay} />
        <AnchorNotes anchors={day.anchors} />
        {day.move && <MoveRoute move={day.move} />}
        {day.move && (
          <MoveTravel
            move={day.move}
            noDuration={noDuration}
            className="pl-5.5"
          />
        )}
        {day.dayTrips.map((dayTrip) => (
          <DayTripLine key={dayTrip.place.id} dayTrip={dayTrip} />
        ))}
        {day.description !== undefined && (
          <ItemDescription className="line-clamp-none text-foreground">
            {day.description}
          </ItemDescription>
        )}
        <VerifyClaims claims={day.verifyClaims} className="mt-1" />
      </ItemContent>
      {linked && (
        <ItemActions className="self-center">
          <ChevronRightIcon
            aria-hidden
            className="size-4 text-muted-foreground"
          />
        </ItemActions>
      )}
    </Item>
  )
}

/**
 * All 15 Days as one timeline, under a marker for each Stay they fall in. The
 * Days are sections of the page, each addressable by its date; on the
 * current Schedule, each also opens its own page.
 */
export function DayTimeline({
  days,
  stays,
  linkDays = false,
  noDuration,
}: {
  days: ReadonlyArray<DayDetail>
  stays: ReadonlyArray<StayDetail>
  /** Whether each Day opens its page at /schedule/$date. */
  linkDays?: boolean
  noDuration?: NoDuration
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
                <DayItem day={day} linked={linkDays} noDuration={noDuration} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
