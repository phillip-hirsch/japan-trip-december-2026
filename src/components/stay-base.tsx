import { useServerFn } from '@tanstack/react-start'
import { PencilIcon } from 'lucide-react'
import { useId } from 'react'

import { ChipChoice } from '@/components/chip-choice'
import { EditorFrame, saveVerb } from '@/components/editor-frame'
import type { SaveVerb } from '@/components/editor-frame'
import { answerStayEdit, hardRuleProblem } from '@/components/schedule-rules'
import { StaySection } from '@/components/stay-section'
import type { StayEditorProps } from '@/components/stay-section'
import type { HardRule } from '@/trip/domain/domain'
import { keyedBy, SaveAnswer, useSave } from '@/trip/client/drafts'
import { placeIds } from '@/trip/catalogue/catalogue-ids'
import type { PlaceId } from '@/trip/catalogue/catalogue-ids'
import { places } from '@/trip/catalogue/places'
import { changeStayBase } from '@/trip/trip/trip.functions'

const unknownPlace = (rule: HardRule) =>
  SaveAnswer.Refused({ problem: hardRuleProblem(rule) })

const baseVerb: SaveVerb = { ...saveVerb, done: 'Base changed' }

/**
 * The Base of a Stay of the Schedule shown. Picking a place keeps no draft,
 * since picking it again loses nothing.
 */
export const useStayBase = ({
  scheduleId,
  stay,
  anchorWarnings,
}: Omit<StayEditorProps, 'next'>) => {
  const change = useServerFn(changeStayBase)

  return useSave<PlaceId>({
    scheduleId,
    saved: stay.base.id,
    write: 'stayEdit',
    run: async (place) =>
      answerStayEdit(
        'The Base change breaks an Anchor',
        anchorWarnings,
        unknownPlace,
      )(await change({ data: { scheduleId, stayId: stay.id, place } })),
  })
}

function StayBaseEditor(props: Omit<StayEditorProps, 'next'>) {
  const { stay } = props
  const field = useStayBase(props)
  const hintId = useId()

  return (
    <StaySection heading="Base" stay={stay}>
      {(headingId) => (
        <EditorFrame
          field={field}
          labelledBy={headingId}
          verb={baseVerb}
          edits={[
            { label: 'Change Base', icon: PencilIcon, onClick: field.edit },
          ]}
          ready={field.value !== stay.base.id}
          buttonSize="sm"
        >
          {(frame) => (
            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={frame.describedWith(hintId)}
            >
              <legend className="mb-2 text-sm">Change the Base to</legend>
              <ChipChoice
                options={placeIds.map((place) => ({
                  value: place,
                  label: places[place].romaji,
                }))}
                value={field.value}
                disabled={frame.busy}
                onChange={field.change}
              />
              <p id={hintId} className="text-sm text-muted-foreground">
                The Stay loses its highlights, and the Moves on either side lose
                their travel time. Its hotel details, note and ticks stay.
              </p>
            </fieldset>
          )}
        </EditorFrame>
      )}
    </StaySection>
  )
}

export const StayBaseField = keyedBy(StayBaseEditor, ({ stay }) => stay.id)
