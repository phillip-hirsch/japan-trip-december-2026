import { Predicate, Struct } from 'effect'

import {
  birthdayDate,
  daysBetween,
  shigeharuEveDate,
  tripEndDate,
  tripStartDate,
} from '@/trip/domain/calendar'
import { Anchor, VerifyClaimAttachment } from '@/trip/domain/domain'
import type {
  IsoDate,
  ItineraryContent,
  Move,
  MoveDetail,
  Place,
  ScheduleDetail,
  ScheduleRecord,
  Station,
  Stay,
  StaySummary,
  VerifyClaim,
  VerifyClaimDetail,
} from '@/trip/domain/domain'
import type { PlaceId, StationId } from '@/trip/catalogue/catalogue-ids'
import { places, visitedPlaceIds } from '@/trip/catalogue/places'
import { stations } from '@/trip/catalogue/rail'
import {
  anchorWarningsOf,
  attachmentKey,
  stayBoundariesOf,
  stayEditOffersOf,
} from '@/trip/domain/schedule-copy'
import type { ScheduleCopy } from '@/trip/domain/schedule-copy'

const nightsOf = (stay: Stay) => daysBetween(stay.checkIn, stay.checkOut)

export const placeOf = (id: PlaceId): Place => ({
  id,
  ...places[id],
  newPlace: !visitedPlaceIds.has(id),
})

export const staySummaryOf = (stay: Stay): StaySummary => ({
  base: placeOf(stay.base),
  checkIn: stay.checkIn,
  checkOut: stay.checkOut,
  nights: nightsOf(stay),
})

const stationOf = (id: StationId): Station => ({ id, ...stations[id] })

export const moveDetailsOf = <M extends Move>({
  stays,
  moves,
}: {
  readonly stays: ReadonlyArray<Stay>
  readonly moves: ReadonlyArray<M>
}) =>
  new Map(
    stayBoundariesOf(stays).flatMap(({ date, from, to }) => {
      const move = moves.find((move) => move.date === date)

      if (move === undefined) return []

      const sections = move.sections.map((section) => ({
        ...section,
        from: stationOf(section.from),
        to: stationOf(section.to),
      }))

      const changeStations = sections.slice(1).map((section) => section.from)

      const detail = {
        ...Struct.omit(move, ['date', 'sections']),
        from: placeOf(from.base),
        to: placeOf(to.base),
        sections,
        changes: changeStations,
      } satisfies MoveDetail

      return [[date, detail] as const]
    }),
  )

const coversWholeDay = (stay: Stay, date: IsoDate) =>
  stay.checkIn < date && date < stay.checkOut

const hasThursdayBackup = (stays: ReadonlyArray<Stay>) =>
  stays.some(
    (stay) => stay.base === 'kyoto' && coversWholeDay(stay, shigeharuEveDate),
  )

export const anchorsOf = ({
  stays,
  shigeharuVisit,
}: ItineraryContent): Array<Anchor> => [
  Anchor.cases.Arrival.make({ date: tripStartDate }),
  ...(shigeharuVisit
    ? [
        Anchor.cases.ShigeharuVisit.make({
          ...shigeharuVisit,
          tentative: true,
          thursdayBackup: hasThursdayBackup(stays),
        }),
      ]
    : []),
  Anchor.cases.Birthday.make({ date: birthdayDate }),
  Anchor.cases.Departure.make({ date: tripEndDate }),
]

const claimsAttachedTo = (
  { verifyClaims }: { readonly verifyClaims: ReadonlyArray<VerifyClaim> },
  attachment: VerifyClaimAttachment,
): Array<VerifyClaimDetail> =>
  verifyClaims
    .filter(
      (claim) => attachmentKey(claim.attachedTo) === attachmentKey(attachment),
    )
    .map(({ id, text }) => ({ id, text }))

const staysAndDaysOf = (copy: ScheduleCopy) => {
  const moves = moveDetailsOf(copy)

  return {
    verifyClaims: claimsAttachedTo(
      copy,
      VerifyClaimAttachment.cases.Itinerary.make({}),
    ),
    stays: copy.stays.map((stay) => ({
      ...stay,
      ...staySummaryOf(stay),
      verifyClaims: claimsAttachedTo(
        copy,
        VerifyClaimAttachment.cases.Stay.make({ checkIn: stay.checkIn }),
      ),
    })),
    days: copy.days.map((day) => {
      const dayAnchors = copy.anchors.filter(
        (anchor) => anchor.date === day.date,
      )

      const move = moves.get(day.date)

      const dayTrips = copy.dayTrips
        .filter((dayTrip) => dayTrip.date === day.date)
        .map((dayTrip) => ({
          ...Struct.omit(dayTrip, ['date', 'place']),
          place: placeOf(dayTrip.place),
        }))

      return {
        ...day,
        anchors: dayAnchors,
        ...(move && { move }),
        dayTrips,
        verifyClaims: claimsAttachedTo(
          copy,
          VerifyClaimAttachment.cases.Day.make({ date: day.date }),
        ),
        freeDay:
          day.description === undefined &&
          move === undefined &&
          dayTrips.length === 0 &&
          !dayAnchors.some(
            (anchor) =>
              Predicate.isTagged('Arrival')(anchor) ||
              Predicate.isTagged('Departure')(anchor),
          ),
      }
    }),
  }
}

/** The stored Schedule as its page shows it. */
export const scheduleDetailOf = ({
  schedule,
  copy,
}: {
  readonly schedule: ScheduleRecord
  readonly copy: ScheduleCopy
}): ScheduleDetail => {
  const { stays, ...rest } = staysAndDaysOf(copy)

  return {
    ...schedule,
    ...rest,
    stays: stays.map((stay) => ({
      ...stay,
      offers: stayEditOffersOf(copy, stay),
    })),
    anchorWarnings: anchorWarningsOf(copy),
  }
}
