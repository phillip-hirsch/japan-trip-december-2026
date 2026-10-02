import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, HistoryIcon } from 'lucide-react'

import { DayTimeline } from '@/components/day-timeline'
import { StayList } from '@/components/stay-list'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { formatMoment } from '@/trip/calendar'
import type { ArchivedScheduleSummary, ScheduleDetail } from '@/trip/domain'

/** A Schedule's Stays and Days, current or archived. */
export function ScheduleSections({ schedule }: { schedule: ScheduleDetail }) {
  return (
    <>
      <section aria-labelledby="stays" className="mt-12">
        <h2 id="stays" className="mb-4 text-xl font-semibold">
          Stays
        </h2>
        <StayList stays={schedule.stays} />
      </section>
      <section aria-labelledby="days" className="mt-12">
        <h2 id="days" className="mb-4 text-xl font-semibold">
          Days
        </h2>
        <DayTimeline days={schedule.days} stays={schedule.stays} />
      </section>
    </>
  )
}

/**
 * Says when the Itinerary a Schedule came from has had a Revision since it
 * was chosen, or is gone. It can't be dismissed: it stays until the Schedule
 * is replaced.
 */
export function RevisionNotice({
  schedule: { sourceItinerary, sourceOptionNumber },
  className,
}: {
  schedule: ScheduleDetail
  className?: string
}) {
  if (sourceItinerary === 'unchanged') return null
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground',
        className,
      )}
    >
      <HistoryIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      {sourceItinerary === 'revised' ? (
        <p>
          Option {sourceOptionNumber} has had a Revision since this Schedule was
          chosen. The Schedule hasn’t changed.{' '}
          <Link
            to="/options/$optionNumber"
            params={{ optionNumber: sourceOptionNumber }}
            className="font-medium underline underline-offset-3"
          >
            See Option {sourceOptionNumber}
          </Link>
        </p>
      ) : (
        <p>Option {sourceOptionNumber} is no longer available.</p>
      )}
    </div>
  )
}

/** The archived Schedules, each opening read-only. */
export function ArchivedScheduleList({
  schedules,
}: {
  schedules: ReadonlyArray<ArchivedScheduleSummary>
}) {
  if (schedules.length === 0) return null
  return (
    <section aria-labelledby="archived" className="mt-12">
      <h2 id="archived" className="text-xl font-semibold">
        Archived Schedules
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Archived when you chose again. Open one to read or restore it.
      </p>
      <ul className="flex flex-col gap-2">
        {schedules.map((schedule) => (
          <li key={schedule.id}>
            <Item
              variant="outline"
              render={
                <Link
                  to="/schedule/archived/$scheduleId"
                  params={{ scheduleId: schedule.id }}
                />
              }
            >
              <ItemContent>
                <ItemTitle>Option {schedule.sourceOptionNumber}</ItemTitle>
                <ItemDescription>
                  Chosen{' '}
                  <time dateTime={schedule.chosenAt}>
                    {formatMoment(schedule.chosenAt)}
                  </time>
                  {' · archived '}
                  <time dateTime={schedule.archivedAt}>
                    {formatMoment(schedule.archivedAt)}
                  </time>
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              </ItemActions>
            </Item>
          </li>
        ))}
      </ul>
    </section>
  )
}
