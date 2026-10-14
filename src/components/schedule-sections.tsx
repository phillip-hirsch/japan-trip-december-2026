import { Link } from '@tanstack/react-router'
import { Predicate } from 'effect'
import { ChevronRightIcon, HistoryIcon } from 'lucide-react'

import { DayTimeline } from '@/components/day-timeline'
import { HotelDetailsField, HotelDetailsList } from '@/components/hotel-details'
import { NoteText } from '@/components/note-text'
import { Notice } from '@/components/notice'
import { PinField } from '@/components/pin-field'
import { StayNote } from '@/components/notes'
import { StayBoundaryField } from '@/components/stay-boundary'
import { StayBaseField } from '@/components/stay-base'
import { StayList } from '@/components/stay-list'
import { StaySection } from '@/components/stay-section'
import { SplitMergeStay } from '@/components/split-merge-stay'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import { formatMoment } from '@/trip/calendar'
import type {
  ArchivedScheduleSummary,
  ScheduleDetail,
  ScheduleStayDetail,
} from '@/trip/domain'

const stayFooter = (schedule: ScheduleDetail) => (stay: ScheduleStayDetail) => {
  const editable = schedule.status === 'current'

  const hotel = Predicate.isTagged('Recorded')(stay.hotel)
    ? stay.hotel
    : undefined

  const { note } = stay
  const next = schedule.stays.find(({ checkIn }) => checkIn === stay.checkOut)

  if (!editable && hotel === undefined && note === undefined) return null

  return (
    <>
      {(editable || hotel) && (
        <StaySection heading="Hotel" stay={stay}>
          {(headingId) =>
            editable ? (
              <>
                <HotelDetailsField
                  scheduleId={schedule.id}
                  stayId={stay.id}
                  hotel={stay.hotel}
                  labelledBy={headingId}
                />
                <PinField
                  scheduleId={schedule.id}
                  target={{ stayId: stay.id }}
                  pin={hotel?.pin}
                  near={stay.base.coordinates}
                  noun="pin"
                  labelledBy={headingId}
                />
              </>
            ) : (
              hotel && <HotelDetailsList details={hotel} />
            )
          }
        </StaySection>
      )}
      {(editable || note !== undefined) && (
        <StaySection heading="Note" stay={stay}>
          {(headingId) =>
            editable ? (
              <StayNote
                scheduleId={schedule.id}
                stayId={stay.id}
                note={note}
                labelledBy={headingId}
              />
            ) : (
              note !== undefined && <NoteText text={note} className="text-sm" />
            )
          }
        </StaySection>
      )}
      {editable && <StayBaseField schedule={schedule} stay={stay} />}
      {editable && (
        <StayBoundaryField
          scheduleId={schedule.id}
          stay={stay}
          next={next}
          anchorWarnings={schedule.anchorWarnings}
        />
      )}
      {editable && <SplitMergeStay schedule={schedule} stay={stay} />}
    </>
  )
}

export function ScheduleSections({
  schedule,
  linkDays = false,
}: {
  schedule: ScheduleDetail
  linkDays?: boolean
}) {
  return (
    <>
      <section aria-labelledby="stays" className="mt-12">
        <h2 id="stays" className="mb-4 text-xl font-semibold">
          Stays
        </h2>
        <StayList stays={schedule.stays} footer={stayFooter(schedule)} />
      </section>
      <section aria-labelledby="days" className="mt-12">
        <h2 id="days" className="mb-4 text-xl font-semibold">
          Days
        </h2>
        <DayTimeline
          days={schedule.days}
          stays={schedule.stays}
          linkDays={linkDays}
          onSchedule
        />
      </section>
    </>
  )
}

export function RevisionNotice({
  schedule: { sourceItinerary, sourceOptionNumber },
  className,
}: {
  schedule: ScheduleDetail
  className?: string
}) {
  if (sourceItinerary === 'unchanged') return null

  return (
    <Notice icon={HistoryIcon} className={className}>
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
    </Notice>
  )
}

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
        Earlier Schedules, as they were when archived. Open one to read or
        restore it.
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
