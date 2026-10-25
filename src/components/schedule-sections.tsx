import { Predicate } from 'effect'

import { DayTimeline } from '@/components/day-timeline'
import { HotelDetailsField } from '@/components/hotel-details'
import { PinField } from '@/components/pin-field'
import { StayNote } from '@/components/notes'
import { StayBoundaryField } from '@/components/stay-boundary'
import { StayBaseField } from '@/components/stay-base'
import { StayList } from '@/components/stay-list'
import { StaySection } from '@/components/stay-section'
import { SplitMergeStay } from '@/components/split-merge-stay'
import type { ScheduleDetail, ScheduleStayDetail } from '@/trip/domain/domain'

const stayFooter = (schedule: ScheduleDetail) => (stay: ScheduleStayDetail) => {
  const hotel = Predicate.isTagged('Recorded')(stay.hotel)
    ? stay.hotel
    : undefined

  return (
    <>
      <StaySection heading="Hotel" stay={stay}>
        {(headingId) => (
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
        )}
      </StaySection>
      <StaySection heading="Note" stay={stay}>
        {(headingId) => (
          <StayNote
            scheduleId={schedule.id}
            stayId={stay.id}
            note={stay.note}
            labelledBy={headingId}
          />
        )}
      </StaySection>
      <StayBaseField
        scheduleId={schedule.id}
        stay={stay}
        anchorWarnings={schedule.anchorWarnings}
      />
      <StayBoundaryField
        scheduleId={schedule.id}
        stay={stay}
        stays={schedule.stays}
        anchorWarnings={schedule.anchorWarnings}
      />
      <SplitMergeStay
        scheduleId={schedule.id}
        stay={stay}
        stays={schedule.stays}
        anchorWarnings={schedule.anchorWarnings}
      />
    </>
  )
}

export function ScheduleSections({ schedule }: { schedule: ScheduleDetail }) {
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
        <DayTimeline days={schedule.days} stays={schedule.stays} />
      </section>
    </>
  )
}
