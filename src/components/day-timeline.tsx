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
} from '@/trip/domain/calendar'
import type { DayDetail, StayDetail } from '@/trip/domain/domain'

function DayItem({
  day,
  linked,
  onSchedule,
}: {
  day: DayDetail
  linked: boolean
  onSchedule?: boolean
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
            onSchedule={onSchedule}
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

export function DayTimeline({
  days,
  stays,
  linkDays = false,
  onSchedule,
}: {
  days: ReadonlyArray<DayDetail>
  stays: ReadonlyArray<StayDetail>
  linkDays?: boolean
  onSchedule?: boolean
}) {
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
                <DayItem day={day} linked={linkDays} onSchedule={onSchedule} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
