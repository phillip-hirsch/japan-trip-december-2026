import { useServerFn } from '@tanstack/react-start'
import { Match } from 'effect'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { AnchorWarnings, hardRuleProblem } from '@/components/schedule-rules'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type {
  AnchorWarning,
  ScheduleId,
  ScheduleStayDetail,
  StayEditOutcome,
} from '@/trip/domain'
import { SaveAnswer, SaveState, useSave } from '@/trip/drafts'
import { isPlaceId, placeIds, places } from '@/trip/places'
import type { PlaceId } from '@/trip/places'
import { changeStayBase } from '@/trip/trip.functions'

const answerOf = (outcome: StayEditOutcome): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Edited: () => SaveAnswer.Saved(),
      ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
      StayNotFound: () =>
        SaveAnswer.Gone({
          problem: 'This Stay is no longer part of your Schedule.',
        }),
      HardRuleBroken: ({ rule }) =>
        SaveAnswer.Refused({ problem: hardRuleProblem(rule) }),
    }),
  )

/**
 * Changing a Stay's Base to another place in the catalogue, with an explicit
 * Save. Picking a place keeps no draft, since picking it again loses nothing.
 * After a change it repeats the Schedule's Anchor warnings here, because the
 * Stay may be far down the page from them. Key it by the Stay's id.
 */
export function StayBaseField({
  scheduleId,
  stay,
  anchorWarnings,
  labelledBy,
}: {
  scheduleId: ScheduleId
  stay: ScheduleStayDetail
  anchorWarnings: ReadonlyArray<AnchorWarning>
  /** The id of the heading naming the Base. */
  labelledBy: string
}) {
  const change = useServerFn(changeStayBase)
  const selectId = useId()
  const hintId = useId()
  const problemId = useId()

  const field = useSave<PlaceId>({
    scheduleId,
    saved: stay.base.id,
    write: 'stayEdit',
    run: async (place) =>
      answerOf(await change({ data: { scheduleId, stayId: stay.id, place } })),
  })

  const { state, value } = field

  if (SaveState.$is('Clean')(state) || SaveState.$is('Saved')(state)) {
    const justSaved = SaveState.$is('Saved')(state) || state.justSaved

    return (
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-describedby={labelledBy}
            onClick={field.edit}
          >
            <PencilIcon data-icon="inline-start" aria-hidden />
            Change Base
          </Button>
          <SavedStatus saved={justSaved}>Base changed</SavedStatus>
        </div>
        {justSaved && <AnchorWarnings warnings={anchorWarnings} />}
      </div>
    )
  }

  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)
  const unchanged = value === stay.base.id

  return (
    <form
      aria-labelledby={labelledBy}
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
        <label htmlFor={selectId} className="text-sm text-muted-foreground">
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
          The Stay loses its highlights, and the Moves on either side lose their
          travel time. Its hotel details, note and ticks stay.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving || unchanged}>
          {saving ? 'Saving…' : notSaved ? 'Retry' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={field.discard}
        >
          {notSaved ? 'Discard' : 'Cancel'}
        </Button>
      </div>
    </form>
  )
}
