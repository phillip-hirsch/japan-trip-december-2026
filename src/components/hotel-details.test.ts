// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useHotelDetails } from '@/components/hotel-details'
import { Hotel, ScheduleId, WriteHotelDetailsOutcome } from '@/trip/domain'
import { SaveState } from '@/trip/drafts'
import { openEditor } from '@/trip/editor-testing'
import { writeHotelDetails } from '@/trip/trip.functions'

vi.mock('@/trip/trip.functions', () => ({ writeHotelDetails: vi.fn() }))

const scheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const recorded = Hotel.cases.Recorded.make({
  name: 'Hotel Gion',
  address: '1 Gion, Kyoto',
})

/** The Hotel details of the Kyoto Stay, recorded as `hotel`. */
const openHotelDetails = (hotel: Hotel, read?: () => Promise<string>) =>
  openEditor(
    () => useHotelDetails({ scheduleId, stayId: 'stay-kyoto', hotel }),
    {},
    read,
  )

/** Why a NotSaved value isn't saved; nothing for any other state. */
const notSavedProblem = <V>(state: SaveState<V>) =>
  SaveState.$is('NotSaved')(state) ? state.problem : undefined

const confirmation = {
  name: 'Hotel Gion',
  address: '1 Gion, Kyoto',
  confirmationNumber: 'AB-1234',
}

describe('the Hotel details', () => {
  it('shows recorded Hotel details as saved, each missing one empty', async () => {
    localStorage.clear()
    const editor = await openHotelDetails(recorded)

    assert.deepStrictEqual(editor.field().value, {
      name: 'Hotel Gion',
      address: '1 Gion, Kyoto',
      confirmationNumber: '',
    })
    await editor.close()
  })

  it('sends the Hotel details to their Stay of the Schedule shown, and is saved', async () => {
    localStorage.clear()
    vi.mocked(writeHotelDetails).mockReset()
    vi.mocked(writeHotelDetails).mockResolvedValue(
      WriteHotelDetailsOutcome.cases.Written.make({}),
    )
    const editor = await openHotelDetails(recorded)

    await act(async () => editor.field().change(confirmation))
    await act(() => editor.field().save())

    assert.deepStrictEqual(vi.mocked(writeHotelDetails).mock.calls, [
      [{ data: { scheduleId, stayId: 'stay-kyoto', details: confirmation } }],
    ])
    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('keeps a Draft that differs only by spaces at the ends from being restored', async () => {
    localStorage.clear()
    const before = await openHotelDetails(recorded)
    await act(async () =>
      before.field().change({
        name: ' Hotel Gion ',
        address: '1 Gion, Kyoto ',
        confirmationNumber: '',
      }),
    )
    await before.close()

    const after = await openHotelDetails(recorded)
    assert.isTrue(SaveState.$is('Clean')(after.field().state))
    await after.close()
  })

  it('keeps a detail that is too long marked "not saved", saying how long each can be', async () => {
    localStorage.clear()
    vi.mocked(writeHotelDetails).mockResolvedValue(
      WriteHotelDetailsOutcome.cases.HotelDetailTooLong.make({
        maxLength: 200,
      }),
    )
    const editor = await openHotelDetails(recorded)

    await act(async () => editor.field().change(confirmation))
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'Each hotel detail can be at most 200 characters.',
    )
    await editor.close()
  })

  it('keeps the Draft for a Stay that no longer exists marked "not saved", says it is gone, and refetches', async () => {
    localStorage.clear()
    vi.mocked(writeHotelDetails).mockResolvedValue(
      WriteHotelDetailsOutcome.cases.StayNotFound.make({
        stayId: 'stay-kyoto',
      }),
    )
    let reads = 0
    const read = async () => `schedules, read ${++reads}`
    const editor = await openHotelDetails(recorded, read)

    await act(async () => editor.field().change(confirmation))
    await act(() => editor.field().save())

    assert.strictEqual(
      notSavedProblem(editor.field().state),
      'This Stay is no longer part of your Schedule, perhaps changed on another device.',
    )
    assert.deepStrictEqual(editor.field().value, confirmation)
    assert.strictEqual(reads, 2)
    await editor.close()

    const reopened = await openHotelDetails(recorded, read)
    assert.isTrue(SaveState.$is('NotSaved')(reopened.field().state))
    assert.deepStrictEqual(reopened.field().value, confirmation)
    await reopened.close()
  })
})
