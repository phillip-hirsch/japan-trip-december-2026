import { Predicate } from 'effect'
import { Link, useNavigate } from '@tanstack/react-router'
import { BedIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Activities } from '@/components/activities'
import { ButtonLink } from '@/components/button-link'
import {
  AnchorBadges,
  AnchorNotes,
  DayTripLine,
  isBirthday,
  MoveRoute,
  MoveTravel,
} from '@/components/day-details'
import { DayNote } from '@/components/notes'
import { DisplayJa } from '@/components/display-ja'
import { NewPlaceBadge } from '@/components/new-place-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { VerifyClaims } from '@/components/verify-claims'
import { useSwipe } from '@/hooks/use-swipe'
import { cn } from '@/lib/utils'
import {
  formatDay,
  formatNights,
  formatShortDate,
  nextTripDate,
  previousTripDate,
  tripDates,
} from '@/trip/calendar'
import type { DayPage, IsoDate, NextMove, TonightsHotel } from '@/trip/domain'

/** A link to the Day before or after, or a disabled control at the Trip's ends. */
function DayStep({
  date,
  direction,
}: {
  date: IsoDate | undefined
  direction: 'previous' | 'next'
}) {
  const Icon = direction === 'previous' ? ChevronLeftIcon : ChevronRightIcon

  const icon = (
    <Icon
      aria-hidden
      data-icon={direction === 'previous' ? 'inline-start' : 'inline-end'}
    />
  )

  if (date === undefined) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        disabled
        aria-label={
          direction === 'previous' ? 'No earlier Day' : 'No later Day'
        }
      >
        {icon}
      </Button>
    )
  }

  return (
    <ButtonLink
      to="/schedule/$date"
      params={{ date }}
      variant="outline"
      size="sm"
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} Day, ${formatDay(date)}`}
    >
      {direction === 'previous' && icon}
      {formatShortDate(date)}
      {direction === 'next' && icon}
    </ButtonLink>
  )
}

/** Steps to the previous or next Day, never beyond December 6 or 20. */
function DayPager({ date, className }: { date: IsoDate; className?: string }) {
  return (
    <nav
      aria-label="Days"
      className={cn('flex items-center justify-between gap-3', className)}
    >
      <DayStep date={previousTripDate(date)} direction="previous" />
      <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
        Day {tripDates.indexOf(date) + 1} of {tripDates.length}
      </span>
      <DayStep date={nextTripDate(date)} direction="next" />
    </nav>
  )
}

function DaySection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="mb-4 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Tonight's hotel: the Stay covering the night, and its hotel once recorded. */
function TonightsHotelCard({ tonight }: { tonight: TonightsHotel }) {
  return (
    <Item variant="outline">
      <ItemMedia className="w-14 justify-start">
        <DisplayJa text={tonight.base.kanji} className="text-2xl" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {tonight.base.romaji}
          <NewPlaceBadge place={tonight.base} />
        </ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {Predicate.isTagged('NotRecorded')(tonight.hotel) && (
            <Badge variant="outline" className="text-muted-foreground">
              <BedIcon data-icon="inline-start" aria-hidden />
              Hotel not recorded
            </Badge>
          )}
          <span>
            <time dateTime={tonight.checkIn}>
              {formatShortDate(tonight.checkIn)}
            </time>
            {' – '}
            <time dateTime={tonight.checkOut}>
              {formatShortDate(tonight.checkOut)}
            </time>
          </span>
        </ItemDescription>
      </ItemContent>
      <ItemActions className="text-sm text-muted-foreground tabular-nums">
        {formatNights(tonight.nights)}
      </ItemActions>
    </Item>
  )
}

/** The next Move: today's, or the first later one, with its travel. */
function NextMoveCard({ move, today }: { move: NextMove; today: IsoDate }) {
  return (
    <Item variant="outline" className="flex-col items-stretch gap-2">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">
        {move.date === today ? (
          'Today'
        ) : (
          <time dateTime={move.date}>{formatDay(move.date)}</time>
        )}
      </p>
      <MoveRoute move={move} className="text-base" />
      <MoveTravel move={move} className="pl-5.5" />
    </Item>
  )
}

const activitiesHeadingId = 'activities'

const noteHeadingId = 'note'

/**
 * A Day of the Schedule, on its own page and as Today on Home: the Day's
 * source description and Day trips, Phillip's Activities and Day note,
 * tonight's hotel and the next Move, with controls to step between Days. On
 * a touch screen, swiping steps too.
 */
export function ScheduleDayView({
  page: { scheduleId, day, tonight, nextMove },
  eyebrow,
}: {
  page: DayPage
  eyebrow: ReactNode
}) {
  const navigate = useNavigate()

  const stepTo = (date: IsoDate | undefined) => {
    if (date !== undefined) {
      void navigate({ to: '/schedule/$date', params: { date } })
    }
  }

  const swipe = useSwipe({
    onSwipeLeft: () => stepTo(nextTripDate(day.date)),
    onSwipeRight: () => stepTo(previousTripDate(day.date)),
  })

  const birthday = isBirthday(day.anchors)

  const nothingPlanned =
    day.description === undefined && day.dayTrips.length === 0

  return (
    <article
      className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16"
      {...swipe}
    >
      <header>
        <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h1
          className={cn(
            'mt-4 text-4xl font-semibold md:text-5xl',
            birthday && 'text-primary',
          )}
        >
          <time dateTime={day.date}>{formatDay(day.date)}</time>
        </h1>
        <AnchorBadges
          anchors={day.anchors}
          freeDay={day.freeDay}
          className="mt-4"
        />
        <div className="mt-2 flex flex-col gap-1">
          <AnchorNotes anchors={day.anchors} />
        </div>
        <DayPager date={day.date} className="mt-8" />
      </header>
      <DaySection id="the-day" title="The day">
        <div className="flex flex-col gap-3">
          {day.dayTrips.map((dayTrip) => (
            <DayTripLine
              key={dayTrip.place.id}
              dayTrip={dayTrip}
              className="text-base"
            />
          ))}
          {day.description !== undefined && (
            <p className="text-base leading-relaxed">{day.description}</p>
          )}
          {nothingPlanned && (
            <p className="text-sm text-muted-foreground">
              {day.freeDay
                ? 'A Free day: the source leaves it open.'
                : 'The source says nothing more about this day.'}
            </p>
          )}
          <VerifyClaims claims={day.verifyClaims} />
        </div>
      </DaySection>
      <DaySection id={activitiesHeadingId} title="Activities">
        <Activities
          key={day.date}
          scheduleId={scheduleId}
          date={day.date}
          activities={day.activities}
          labelledBy={activitiesHeadingId}
        />
      </DaySection>
      <DaySection id={noteHeadingId} title="Note">
        <DayNote
          key={day.date}
          scheduleId={scheduleId}
          date={day.date}
          note={day.note}
          labelledBy={noteHeadingId}
        />
      </DaySection>
      {tonight && (
        <DaySection id="tonight" title="Tonight">
          <TonightsHotelCard tonight={tonight} />
        </DaySection>
      )}
      {nextMove && (
        <DaySection id="next-move" title="Next Move">
          <NextMoveCard move={nextMove} today={day.date} />
        </DaySection>
      )}
      <p className="mt-12 text-sm text-muted-foreground">
        <Link
          to="/schedule"
          hash={day.date}
          className="text-foreground underline underline-offset-3"
        >
          See this Day in the whole Schedule
        </Link>
      </p>
    </article>
  )
}
