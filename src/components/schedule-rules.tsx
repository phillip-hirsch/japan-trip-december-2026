import { Match } from 'effect'
import { TriangleAlertIcon } from 'lucide-react'

import { Notice } from '@/components/notice'
import {
  birthdayDate,
  formatDay,
  formatShortDate,
  shigeharuDate,
  tripEndDate,
  tripStartDate,
} from '@/trip/calendar'
import type { AnchorWarning, HardRule } from '@/trip/domain'
import { places } from '@/trip/places'

/** What an Anchor warning says, naming the Anchor it breaks. */
const anchorWarningText = (warning: AnchorWarning) =>
  Match.value(warning).pipe(
    Match.tagsExhaustive({
      NotWakingUpInKyoto: ({ base }) =>
        `You won’t wake up in Kyoto for the Shigeharu visit on ${formatDay(shigeharuDate)}. ${
          base === undefined
            ? 'No Stay covers the night before.'
            : `You spend the night before in ${places[base].romaji}.`
        }`,
      MoveOnBirthday: () =>
        `A Move falls on your Birthday, ${formatDay(birthdayDate)}.`,
      EndsOutsideTokyo: ({ base }) =>
        `Your last Stay is in ${places[base].romaji}, not Tokyo, before you fly home on ${formatDay(tripEndDate)}.`,
    }),
  )

/**
 * The Anchors the Schedule breaks, and its last Stay outside Tokyo. They
 * never block a Stay edit, and stay until the Schedule stops breaking them.
 */
export function AnchorWarnings({
  warnings,
  className,
}: {
  warnings: ReadonlyArray<AnchorWarning>
  className?: string
}) {
  if (warnings.length === 0) return null

  return (
    <Notice
      icon={TriangleAlertIcon}
      iconClassName="text-primary"
      className={className}
    >
      <ul className="flex flex-col gap-1.5">
        {warnings.map((warning) => (
          <li key={warning._tag}>{anchorWarningText(warning)}</li>
        ))}
      </ul>
    </Notice>
  )
}

/**
 * The problem a refused Stay edit shows. It names the Hard rule the edit
 * would break.
 */
export const hardRuleProblem = (rule: HardRule) =>
  Match.value(rule).pipe(
    Match.tagsExhaustive({
      NoStays: () => 'Your Schedule needs at least one Stay.',
      NotTheTripDates: () =>
        `Your first Stay must check in on ${formatShortDate(tripStartDate)}, and your last must check out on ${formatShortDate(tripEndDate)}.`,
      StayWithoutNights: ({ checkIn }) =>
        `Every Stay needs at least one night. The Stay from ${formatShortDate(checkIn)} would have none.`,
      Gap: ({ from, to }) =>
        `Your Stays must be back to back. No Stay would cover ${formatShortDate(from)} to ${formatShortDate(to)}.`,
      Overlap: ({ from, to }) =>
        `Your Stays must be back to back. Two would overlap from ${formatShortDate(from)} to ${formatShortDate(to)}.`,
      StaysNotAdjacent: () => 'Only Stays next to each other can be merged.',
      StaysInDifferentBases: () => 'Only Stays in the same Base can be merged.',
      PlaceNotInCatalogue: () =>
        'The app doesn’t know that place. Add new places with the Itinerary guide.',
    }),
  )
