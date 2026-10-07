import { Match } from 'effect'
import { TriangleAlertIcon } from 'lucide-react'

import { Notice } from '@/components/notice'
import { toast } from '@/components/ui/toast'
import {
  birthdayDate,
  formatDay,
  formatShortDate,
  shigeharuDate,
  tripEndDate,
  tripStartDate,
} from '@/trip/calendar'
import type { AnchorWarning, HardRule, StayEditOutcome } from '@/trip/domain'
import { SaveAnswer } from '@/trip/drafts'
import { places } from '@/trip/places'

/** What an Anchor warning says, naming the Anchor it breaks. */
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

/**
 * What a Stay edit answered. When one goes through and breaks an Anchor the
 * Schedule didn't break before, a toast titled as given names it. The
 * Schedule page shows the warning until the Schedule stops breaking that
 * Anchor.
 */
export const stayEditAnswerOf =
  (anchorBroken: string, warningsBefore: ReadonlyArray<AnchorWarning>) =>
  (outcome: StayEditOutcome): SaveAnswer =>
    Match.value(outcome).pipe(
      Match.tagsExhaustive({
        Edited: ({ schedule }) => {
          const added = schedule.anchorWarnings.filter(
            (warning) =>
              !warningsBefore.some(({ _tag }) => _tag === warning._tag),
          )

          if (added.length > 0) {
            toast.add({
              type: 'warning',
              title: anchorBroken,
              description: added.map(anchorWarningText).join(' '),
            })
          }

          return SaveAnswer.Saved()
        },
        ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
        StayNotFound: () =>
          SaveAnswer.Gone({
            problem:
              'This Stay is no longer part of your Schedule. It may have changed on another device.',
          }),
        // The controls offer only edits that keep the Hard rules, so a refusal
        // means another device changed these Stays: refetch them.
        HardRuleBroken: ({ rule }) =>
          SaveAnswer.Gone({
            problem: `${hardRuleProblem(rule)} Nothing changed. Your Stays may have changed on another device.`,
          }),
      }),
    )
