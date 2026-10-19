// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { usePin } from '@/components/pin-field'
import { ScheduleId, SetPinOutcome } from '@/trip/domain/domain'
import type { Pin } from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  notSavedProblem,
  openEditor,
} from '@/trip/client/editor-testing'
import { setPin } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({ setPin: vi.fn() }))

const scheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const target = { activityId: 'activity-tsukiji' }

const tsukiji = { latitude: 35.6655, longitude: 139.7707 }

const seoul = { latitude: 37.5665, longitude: 126.978 }

/** The Pin of the Tsukiji Activity, set as `pin`. */
const openPin = (pin: Pin | undefined) =>
  openEditor(() => usePin({ scheduleId, target, pin }), {})

describe('the Pin', () => {
  it('is saved once it sends the confirmed Pin, with its link trimmed, to its Activity of the Schedule shown', async () => {
    localStorage.clear()
    vi.mocked(setPin).mockImplementation(
      answeringOnly(
        {
          scheduleId,
          target,
          pin: {
            coordinates: tsukiji,
            link: 'https://maps.app.goo.gl/tsukiji',
          },
        },
        SetPinOutcome.cases.Set.make({}),
        SetPinOutcome.cases.ScheduleChanged.make({}),
      ),
    )
    const editor = await openPin(undefined)

    await act(async () =>
      editor.field().change({
        link: ' https://maps.app.goo.gl/tsukiji ',
        coordinates: tsukiji,
      }),
    )
    await act(() => editor.field().save())

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('removes the Pin by sending none', async () => {
    localStorage.clear()
    vi.mocked(setPin).mockImplementation(
      answeringOnly(
        { scheduleId, target },
        SetPinOutcome.cases.Set.make({}),
        SetPinOutcome.cases.ScheduleChanged.make({}),
      ),
    )
    const editor = await openPin({ coordinates: tsukiji })

    await act(() => editor.field().send({ link: '', coordinates: null }))

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a Pin outside Japan marked "not saved", asking to drag it back', async () => {
    localStorage.clear()
    vi.mocked(setPin).mockResolvedValue(
      SetPinOutcome.cases.CoordinatesOutsideJapan.make({ coordinates: seoul }),
    )
    const editor = await openPin(undefined)

    await act(async () =>
      editor.field().change({ link: '', coordinates: seoul }),
    )
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'The pin is outside Japan. Drag it back into Japan.',
    )
    await editor.close()
  })

  it('keeps a link that isn’t Google Maps marked "not saved", saying which links work', async () => {
    localStorage.clear()
    vi.mocked(setPin).mockResolvedValue(
      SetPinOutcome.cases.LocationLinkRefused.make({ reason: 'NotGoogleMaps' }),
    )
    const editor = await openPin(undefined)

    await act(async () =>
      editor
        .field()
        .change({ link: 'https://example.com', coordinates: tsukiji }),
    )
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'That isn’t a Google Maps link. Paste one that starts with https://maps.app.goo.gl/ or https://www.google.com/maps, or drop the pin by hand.',
    )
    await editor.close()
  })
})
