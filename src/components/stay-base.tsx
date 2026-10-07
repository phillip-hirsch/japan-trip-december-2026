import { useServerFn } from '@tanstack/react-start'
import { Predicate } from 'effect'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { hardRuleProblem, stayEditAnswerOf } from '@/components/schedule-rules'
import { StaySection } from '@/components/stay-section'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { ScheduleDetail, ScheduleStayDetail } from '@/trip/domain'
import { SaveAnswer, SaveState, useSave } from '@/trip/drafts'
import { isPlaceId, placeIds, places } from '@/trip/places'
import type { PlaceId } from '@/trip/places'
import { changeStayBase } from '@/trip/trip.functions'

/**
 * Changing a Stay's Base to another place in the catalogue on the current
 * Schedule, with an explicit Save. Picking a place keeps no draft, since
 * picking it again loses nothing. Key it by the Stay's id.
 */
export function StayBaseField({
  schedule,
  stay,
}: {
  schedule: ScheduleDetail
  stay: ScheduleStayDetail
}) {
  const change = useServerFn(changeStayBase)
  const selectId = useId()
  const hintId = useId()
  const problemId = useId()
  const scheduleId = schedule.id

  const field = useSave<PlaceId>({
    scheduleId,
    saved: stay.base.id,
    write: 'stayEdit',
    run: async (place) => {
      const outcome = await change({
        data: { scheduleId, stayId: stay.id, place },
      })

      // A Base change keeps the Stay dates, so the one Hard rule it can break
      // is a place the server doesn't know. Refetching the Stays wouldn't
      // help, so it's refused rather than gone.
      return Predicate.isTagged('HardRuleBroken')(outcome)
        ? SaveAnswer.Refused({ problem: hardRuleProblem(outcome.rule) })
        : stayEditAnswerOf(
            'The Base change breaks an Anchor',
            schedule.anchorWarnings,
          )(outcome)
    },
  })

  const { state, value } = field

  return (
    <StaySection heading="Base" stay={stay}>
      {(headingId) => {
        if (SaveState.$is('Clean')(state) || SaveState.$is('Saved')(state)) {
          return (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                aria-describedby={headingId}
                onClick={field.edit}
              >
                <PencilIcon data-icon="inline-start" aria-hidden />
                Change Base
              </Button>
              <SavedStatus
                saved={SaveState.$is('Saved')(state) || state.justSaved}
              >
                Base changed
              </SavedStatus>
            </div>
          )
        }

        const notSaved = SaveState.$is('NotSaved')(state)
        const saving = SaveState.$is('Saving')(state)

        return (
          <form
            aria-labelledby={headingId}
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void field.save()
            }}
          >
            {notSaved && (
              <NotSavedAlert problem={state.problem} problemId={problemId} />
            )}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={selectId}
                className="text-sm text-muted-foreground"
              >
                New Base
              </label>
              <NativeSelect
                id={selectId}
                aria-describedby={notSaved ? `${problemId} ${hintId}` : hintId}
                // Opening the editor focuses it.
                autoFocus={SaveState.$is('Editing')(state)}
                // A change in flight fixes the place, so two changes never race.
                disabled={saving}
                value={value}
                onChange={(event) => {
                  const place = event.target.value

                  if (isPlaceId(place)) field.change(place)
                }}
                className="w-full sm:w-64"
              >
                {placeIds.map((place) => (
                  <NativeSelectOption key={place} value={place}>
                    {places[place].romaji}
                    {place === stay.base.id && ' (now)'}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p id={hintId} className="text-sm text-muted-foreground">
                The Stay loses its highlights, and the Moves on either side lose
                their travel time. Its hotel details, note and ticks stay.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={saving || value === stay.base.id}
              >
                {saving ? 'Saving…' : notSaved ? 'Retry' : 'Save'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={field.discard}
              >
                {notSaved ? 'Discard' : 'Cancel'}
              </Button>
            </div>
          </form>
        )
      }}
    </StaySection>
  )
}
