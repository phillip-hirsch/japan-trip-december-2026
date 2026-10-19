// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useEditorFrame } from '@/components/editor-frame'
import { useStayBoundary } from '@/components/stay-boundary'
import { december, HardRule, StayEditOutcome } from '@/trip/domain/domain'
import type { ScheduleStayDetail, StayEditOffers } from '@/trip/domain/domain'
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

/** The Kyoto Stay, December 9 to 12, offering the Stay edits given. */
const kyotoOffering = (offers?: StayEditOffers) =>
  scheduleStay('stay-kyoto', 'kyoto', 9, 12, offers)

const osaka = scheduleStay('stay-osaka', 'osaka', 12, 14)

/** The Kyoto Stay before the Osaka one, its check-out offered up to Dec 13. */
const kyotoBeforeOsaka = {
  stay: kyotoOffering({
    splitDates: [],
    boundary: {
      next: 'stay-osaka',
      checkOuts: [december(10), december(11), december(12), december(13)],
    },
  }),
  stays: [osaka],
}

/** The Kyoto Stay as the last, its check-out offering no move. */
const kyotoLast = { stay: kyotoOffering(), stays: [] }

interface Shown {
  readonly stay: ScheduleStayDetail
  readonly stays: ReadonlyArray<ScheduleStayDetail>
}

/**
 * The check-out of the Kyoto Stay with the other Stays of the Schedule shown,
 * and its frame.
 */
const openStayBoundary = (shown: Shown) =>
  openEditor(({ stay, stays }: Shown) => {
    const field = useStayBoundary({
      scheduleId,
      stay,
      stays: [stay, ...stays],
      anchorWarnings: [],
    })

    return { field, frame: useEditorFrame(field) }
  }, shown)

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
    const editor = await openStayBoundary(kyotoBeforeOsaka)

    await act(async () => editor.field().field.change(december(11)))
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('offers the check-outs and next Stay the Schedule read offers', async () => {
    localStorage.clear()
    const editor = await openStayBoundary(kyotoBeforeOsaka)

    const { checkOuts, next } = editor.field().field
    assert.deepStrictEqual(
      { checkOuts, next: next?.id },
      {
        checkOuts: [december(10), december(11), december(12), december(13)],
        next: 'stay-osaka',
      },
    )
    await editor.close()
  })

  it('shows an open Stay boundary edit as withdrawn once the Stay is the last, offering Cancel', async () => {
    localStorage.clear()
    const editor = await openStayBoundary(kyotoBeforeOsaka)
    await act(async () => editor.field().field.change(december(11)))

    await editor.show(kyotoLast)

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
    const editor = await openStayBoundary(kyotoBeforeOsaka)
    await act(async () => editor.field().field.change(december(11)))
    await act(() => editor.field().field.save())

    await editor.show(kyotoLast)

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
