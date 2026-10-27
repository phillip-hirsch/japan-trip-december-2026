// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useEditorFrame } from '@/components/editor-frame'
import { useStayBase } from '@/components/stay-base'
import { HardRule, StayEditOutcome } from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  notSavedProblem,
  openEditor,
  scheduleStay,
  staysEdited,
} from '@/trip/client/editor-testing'
import { changeStayBase } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({ changeStayBase: vi.fn() }))

const kyoto = scheduleStay('stay-kyoto', 'kyoto', 9, 12)

/** The Base of the Kyoto Stay, and its frame. */
const openStayBase = (read?: () => Promise<string>) =>
  openEditor(
    () => {
      const field = useStayBase({ stay: kyoto, anchorWarnings: [] })

      return { field, frame: useEditorFrame(field) }
    },
    {},
    read,
  )

describe('changing a Base', () => {
  it('is changed once it sends the place chosen to the Stay', async () => {
    vi.mocked(changeStayBase).mockImplementation(
      answeringOnly(
        { stayId: 'stay-kyoto', place: 'uji' },
        staysEdited(),
        StayEditOutcome.cases.StayNotFound.make({ stayId: 'stay-kyoto' }),
      ),
    )
    const editor = await openStayBase()

    await act(async () => editor.field().field.edit())
    await act(async () => editor.field().field.change('uji'))
    await act(() => editor.field().field.save())

    assert.deepStrictEqual(
      editor.field().field.state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a place the app doesn’t know marked "not saved", without re-reading the Schedules', async () => {
    vi.mocked(changeStayBase).mockResolvedValue(
      StayEditOutcome.cases.HardRuleBroken.make({
        rule: HardRule.cases.PlaceNotInCatalogue.make({ place: 'uji' }),
      }),
    )
    let reads = 0
    const editor = await openStayBase(async () => `schedules, read ${++reads}`)

    await act(async () => editor.field().field.edit())
    await act(async () => editor.field().field.change('uji'))
    await act(() => editor.field().field.save())

    assert.strictEqual(
      notSavedProblem(editor.field().field.state),
      'The app doesn’t know that place. Add new places with the places guide, docs/agents/places.md.',
    )
    assert.strictEqual(editor.field().frame.view, 'form')
    assert.strictEqual(editor.schedulesShown(), 'schedules, read 1')
    await editor.close()
  })
})
