import { useServerFn } from '@tanstack/react-start'

import { ButtonLink } from '@/components/button-link'
import {
  replacementAnswerOf,
  ReplaceScheduleDialog,
} from '@/components/replace-schedule-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ScheduleSummary } from '@/trip/domain'
import { useScheduleSummary } from '@/trip/queries'
import { chooseItinerary } from '@/trip/trip.functions'

/**
 * What an Itinerary's page offers about Phillip's Schedule, from the Schedule
 * summary: a neutral placeholder until it answers, then Choose, with where
 * the current Schedule came from once one exists.
 */
export function ChooseItinerary({ optionNumber }: { optionNumber: number }) {
  const summary = useScheduleSummary()

  if (summary === undefined) {
    return <Skeleton aria-hidden className="h-10 w-40" />
  }

  const fromThis = summary?.sourceOptionNumber === optionNumber

  // Choose keeps its identity (its key) whichever links surround it, so an
  // open dialog stays open while the summary changes under it.
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {fromThis && (
          <ButtonLink key="open" to="/schedule" size="lg">
            Open your Schedule
          </ButtonLink>
        )}
        <ChooseItineraryButton
          key="choose"
          optionNumber={optionNumber}
          current={summary}
        />
        {summary && !fromThis && (
          <ButtonLink
            key="open-outline"
            to="/schedule"
            size="lg"
            variant="outline"
          >
            Open your Schedule
          </ButtonLink>
        )}
      </div>
      {summary && (
        <p className="mt-3 text-sm text-muted-foreground">
          {fromThis
            ? 'Your Schedule came from this Itinerary. Choose it again for a fresh copy, such as after a Revision.'
            : `Your Schedule came from Option ${summary.sourceOptionNumber}.`}
        </p>
      )}
    </div>
  )
}

/**
 * Choose, after a confirmation saying what happens: copies the Itinerary
 * into a fresh Schedule, archiving the current one, and opens it.
 */
function ChooseItineraryButton({
  optionNumber,
  current,
}: {
  optionNumber: number
  current: ScheduleSummary | null
}) {
  const choose = useServerFn(chooseItinerary)
  const again = current?.sourceOptionNumber === optionNumber
  const label = `Choose Option ${optionNumber}${again ? ' again' : ''}`

  return (
    <ReplaceScheduleDialog
      write="choose"
      target={`Option ${optionNumber}`}
      run={async (operationId) =>
        replacementAnswerOf(
          await choose({
            data: { operationId, optionNumber, replacing: current?.id ?? null },
          }),
        )
      }
      trigger={<Button size="lg" variant={again ? 'outline' : 'default'} />}
      triggerLabel={label}
      title={`${label}?`}
      description={
        current ? (
          <>
            <p>
              A fresh copy of its Stays and Days becomes your Schedule. Later
              Revisions of Option {optionNumber} won’t change it.
            </p>
            <p>
              Your current Schedule, from Option {current.sourceOptionNumber},
              is archived. You can open or restore it from your Schedule.
            </p>
            <p>Your Trip note and your own Checklist items carry over.</p>
          </>
        ) : (
          <p>
            It becomes your Schedule: your own copy of its Stays and Days to
            plan in. Later Revisions of Option {optionNumber} won’t change it.
          </p>
        )
      }
      action={label}
      working="Choosing…"
      failed="Choosing didn’t go through. Try again; it won’t choose twice."
    />
  )
}
