// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useEditorFrame } from '@/components/editor-frame'
import { useStayBoundary } from '@/components/stay-boundary'
import { december, HardRule, StayEditOutcome } from '@/trip/domain/domain'
import type { ScheduleStayDetail } from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  openEditor,
  scheduleId,
  scheduleStay,
  staysEdited,
} from '@/trip/client/editor-testing'
import { moveStayBoundary } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({ moveStayBoundary: vi.fn() }))

const kyoto = scheduleStay('stay-kyoto', 'kyoto', 9, 12)

const osaka = scheduleStay('stay-osaka', 'osaka', 12, 14)

/**
 * The check-out of the Kyoto Stay, December 9 to 12, while the Stay after it
 * is `next`, and its frame.
 */
const openStayBoundary = (next: ScheduleStayDetail | undefined) =>
  openEditor(
    ({ next }: { next: ScheduleStayDetail | undefined }) => {
      const field = useStayBoundary({
        scheduleId,
        stay: kyoto,
        next,
        anchorWarnings: [],
      })

      return { field, frame: useEditorFrame(field) }
    },
    { next },
  )

describe('moving the date between two Stays', () => {
  it('is saved once it sends the check-out chosen to the Stay of the Schedule shown', async () => {
    localStorage.clear()
    vi.mocked(moveStayBoundary).mockImplementation(
      answeringOnly(
        { scheduleId, stayId: 'stay-kyoto', checkOut: december(11) },
        staysEdited(),
        StayEditOutcome.cases.StayNotFound.make({ stayId: 'stay-kyoto' }),
      ),
    )
    const editor = await openStayBoundary(osaka)

    await act(async () => editor.field().field.change(december(11)))
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('shows an open Stay boundary edit as withdrawn once the Stay is the last, offering Cancel', async () => {
    localStorage.clear()
    const editor = await openStayBoundary(osaka)
    await act(async () => editor.field().field.change(december(11)))

    await editor.show({ next: undefined })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { shown: editor.field().field.shown, view, discardLabel, problem },
      {
        shown: true,
        view: 'withdrawn',
        discardLabel: 'Cancel',
        problem: undefined,
      },
    )
    await editor.close()
  })

  it('keeps a Stay boundary edit the Hard rules refused visible as withdrawn, with the refusal, offering Discard', async () => {
    localStorage.clear()
    vi.mocked(moveStayBoundary).mockResolvedValue(
      StayEditOutcome.cases.HardRuleBroken.make({
        rule: HardRule.cases.StayWithoutNights.make({
          checkIn: december(12),
        }),
      }),
    )
    const editor = await openStayBoundary(osaka)
    await act(async () => editor.field().field.change(december(11)))
    await act(() => editor.field().field.save())

    await editor.show({ next: undefined })

    const { view, discardLabel, problem } = editor.field().frame
    assert.deepStrictEqual(
      { shown: editor.field().field.shown, view, discardLabel, problem },
      {
        shown: true,
        view: 'withdrawn',
        discardLabel: 'Discard',
        problem:
          'Every Stay needs at least one night. The Stay from Dec 12 would have none. Nothing changed. Your Stays may have changed on another device.',
      },
    )
    await editor.close()
  })
})
