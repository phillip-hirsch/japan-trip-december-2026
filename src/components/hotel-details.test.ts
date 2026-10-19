// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useHotelDetails } from '@/components/hotel-details'
import {
  Hotel,
  ScheduleId,
  WriteHotelDetailsOutcome,
} from '@/trip/domain/domain'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  notSavedProblem,
  openEditor,
} from '@/trip/client/editor-testing'
import { writeHotelDetails } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({ writeHotelDetails: vi.fn() }))

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

const confirmation = {
  name: 'Hotel Gion',
  address: '1 Gion, Kyoto',
  confirmationNumber: 'AB-1234',
}

describe('the Hotel details', () => {
  it('starts from the recorded Hotel details, with an empty field for each missing one', async () => {
    localStorage.clear()
    const editor = await openHotelDetails(recorded)

    assert.deepStrictEqual(editor.field().value, {
      name: 'Hotel Gion',
      address: '1 Gion, Kyoto',
      confirmationNumber: '',
    })
    await editor.close()
  })

  it('is saved once it sends the Hotel details to their Stay of the Schedule shown', async () => {
    localStorage.clear()
    vi.mocked(writeHotelDetails).mockImplementation(
      answeringOnly(
        { scheduleId, stayId: 'stay-kyoto', details: confirmation },
        WriteHotelDetailsOutcome.cases.Written.make({}),
        WriteHotelDetailsOutcome.cases.StayNotFound.make({
          stayId: 'stay-kyoto',
        }),
      ),
    )
    const editor = await openHotelDetails(recorded)

    await act(async () => editor.field().change(confirmation))
    await act(() => editor.field().save())

    assert.deepStrictEqual(
      editor.field().state,
      SaveState.Clean({ justSaved: true }),
    )
    await editor.close()
  })

  it('does not restore a Draft that differs from the saved Hotel details only by spaces at the ends', async () => {
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
    assert.strictEqual(editor.schedulesShown(), 'schedules, read 2')
    await editor.close()

    const reopened = await openHotelDetails(recorded, read)
    assert.isTrue(SaveState.$is('NotSaved')(reopened.field().state))
    assert.deepStrictEqual(reopened.field().value, confirmation)
    await reopened.close()
  })
})
