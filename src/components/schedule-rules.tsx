import { Match, Predicate } from 'effect'
import { TriangleAlertIcon } from 'lucide-react'

import { Notice } from '@/components/notice'
import {
  birthdayDate,
  formatDay,
  formatShortDate,
  shigeharuDate,
  tripEndDate,
  tripStartDate,
} from '@/trip/domain/calendar'
import type {
  AnchorWarning,
  HardRule,
  StayEditOutcome,
} from '@/trip/domain/domain'
import { answerOwn, SaveAnswer, warned } from '@/trip/client/drafts'
import type { SaveWarning } from '@/trip/client/drafts'
import { places } from '@/trip/catalogue/places'

export const anchorWarningText = (warning: AnchorWarning) =>
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

const staleStays = (rule: HardRule) =>
  SaveAnswer.Gone({
    problem: `${hardRuleProblem(rule)} Nothing changed. Your Stays may have changed on another device.`,
  })

const anchorWarningOf = (
  title: string,
  warningsBefore: ReadonlyArray<AnchorWarning>,
  outcome: StayEditOutcome,
): SaveWarning | undefined => {
  if (!Predicate.isTagged('Edited')(outcome)) return undefined

  const added = outcome.schedule.anchorWarnings.filter(
    (warning) => !warningsBefore.some(({ _tag }) => _tag === warning._tag),
  )

  return added.length === 0
    ? undefined
    : { title, description: added.map(anchorWarningText).join(' ') }
}

/**
 * Answers a Stay edit, warning of the Anchors it broke that weren't broken
 * before. A broken Hard rule means the Stays shown are stale, unless
 * `brokenRule` answers it otherwise.
 */
export const answerStayEdit =
  (
    anchorBroken: string,
    warningsBefore: ReadonlyArray<AnchorWarning>,
    brokenRule: (rule: HardRule) => SaveAnswer = staleStays,
  ) =>
  (outcome: StayEditOutcome) =>
    warned(
      answerOwn(outcome, ({ rule }) => brokenRule(rule)),
      anchorWarningOf(anchorBroken, warningsBefore, outcome),
    )
