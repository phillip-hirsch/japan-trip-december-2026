import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { CalendarIcon } from 'lucide-react'
import { useId } from 'react'

import { DateChoice } from '@/components/date-choice'
import { EditorFrame } from '@/components/editor-frame'
import { answerStayEdit } from '@/components/schedule-rules'
import { StaySection } from '@/components/stay-section'
import type { StayEditorProps } from '@/components/stay-section'
import {
  formatDay,
  formatNights,
  isTripDate,
  nightsBetween,
  tripDates,
} from '@/trip/domain/calendar'
import type { IsoDate } from '@/trip/domain/domain'
import { stayBoundaryTarget, useSave } from '@/trip/client/drafts'
import { moveStayBoundary } from '@/trip/trip/trip.functions'

const isDate = (value: unknown): value is IsoDate =>
  Predicate.isString(value) && isTripDate(value)

/**
 * The check-out of a Stay of the Schedule shown, which moves while `next`,
 * another Stay, follows it.
 */
export const useStayBoundary = ({
  scheduleId,
  stay,
  next,
  anchorWarnings,
}: StayEditorProps) => {
  const move = useServerFn(moveStayBoundary)

  return useSave<IsoDate>({
    target: stayBoundaryTarget(stay.id),
    draft: isDate,
    offered: () => next !== undefined,
    scheduleId,
    saved: stay.checkOut,
    write: 'stayEdit',
    run: async (checkOut) =>
      answerStayEdit(
        'The move breaks an Anchor',
        anchorWarnings,
      )(await move({ data: { scheduleId, stayId: stay.id, checkOut } })),
  })
}

export function StayBoundaryField(props: StayEditorProps) {
  const { stay, next } = props
  const field = useStayBoundary(props)
  const hintId = useId()

  if (!field.shown) return null

  const { value } = field

  const dates =
    next === undefined
      ? []
      : tripDates.filter((date) => date > stay.checkIn && date < next.checkOut)

  const chosen = dates.find((date) => date === value)

  // The summary and form show only while another Stay follows this one.
  return (
    <StaySection heading="Check-out" stay={stay}>
      {(headingId) => (
        <EditorFrame
          field={field}
          labelledBy={headingId}
          summary={
            next && (
              <p className="text-sm">
                Move to {next.base.romaji} on{' '}
                <time dateTime={value}>{formatDay(value)}</time>.
              </p>
            )
          }
          edits={[
            { label: 'Change date', icon: CalendarIcon, onClick: field.edit },
          ]}
          withdrawnReason="This is now your last Stay, so its check-out can’t move."
          ready={chosen !== undefined}
          buttonSize="sm"
        >
          {(frame) =>
            next && (
              <fieldset
                className="flex flex-col gap-2"
                aria-describedby={frame.describedWith(hintId)}
              >
                <legend className="mb-2 text-sm">Check out on</legend>
                <DateChoice
                  dates={dates}
                  value={chosen}
                  disabled={frame.busy}
                  onChange={field.change}
                />
                <p id={hintId} className="text-sm text-muted-foreground">
                  {chosen === undefined
                    ? `The Stays next to this one have changed. Choose the date ${stay.base.romaji} checks out again.`
                    : `${formatNights(nightsBetween(stay.checkIn, chosen))} in ${stay.base.romaji}, then ${formatNights(nightsBetween(chosen, next.checkOut))} in ${next.base.romaji}. Your Move to ${next.base.romaji} changes to that day too.`}
                </p>
              </fieldset>
            )
          }
        </EditorFrame>
      )}
    </StaySection>
  )
}
