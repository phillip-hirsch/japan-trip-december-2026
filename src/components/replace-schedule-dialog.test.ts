// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import {
  useChooseItinerary,
  useRestoreSchedule,
} from '@/components/replace-schedule-dialog'
import type { ScheduleReplacement } from '@/components/replace-schedule-dialog'
import {
  answeringOnlyUnderAnyOperation,
  comeBackOnline,
  goOffline,
  openEditor,
} from '@/trip/client/editor-testing'
import { ChooseOutcome, RestoreOutcome, ScheduleId } from '@/trip/domain/domain'
import { chooseItinerary, restoreSchedule } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  chooseItinerary: vi.fn(),
  restoreSchedule: vi.fn(),
}))

const chosen = ScheduleId.make('00000000-0000-4000-8000-00000000000c')

const archived = ScheduleId.make('00000000-0000-4000-8000-00000000000d')

/** What the confirmation shows of a replacement. */
const shown = ({
  open,
  paused,
  working,
  refusal,
  failed,
}: ScheduleReplacement) => ({
  open,
  paused,
  working,
  refusal,
  failed,
})

/**
 * Confirms `useReplacement` while offline and again once the connection
 * returns, and returns what the confirmation showed each time.
 */
const confirmOfflineThenOnline = async (
  useReplacement: () => ScheduleReplacement,
) => {
  const dialog = await openEditor(useReplacement, {})
  await act(async () => dialog.field().openChange(true))

  await goOffline()
  await act(() => dialog.field().confirm())
  const offline = shown(dialog.field())
  await comeBackOnline()
  await act(() => dialog.field().confirm())
  const { open, paused } = dialog.field()
  await dialog.close()

  return [offline, { open, paused }]
}

const confirmingOffline = {
  open: true,
  paused: true,
  working: false,
  refusal: undefined,
  failed: false,
}

/** Replaced, the confirmation closes and the Schedule opens. */
const replacedOnline = { open: false, paused: false }

describe('replacing the Schedule while offline', () => {
  it('chooses nothing while offline, and chooses the Itinerary once the connection returns', async () => {
    vi.mocked(chooseItinerary).mockImplementation(
      answeringOnlyUnderAnyOperation(
        { optionNumber: 2, replacing: null },
        ChooseOutcome.cases.Chosen.make({ scheduleId: chosen }),
        ChooseOutcome.cases.ItineraryNotFound.make({ optionNumber: 2 }),
      ),
    )

    assert.deepStrictEqual(
      await confirmOfflineThenOnline(() =>
        useChooseItinerary({ optionNumber: 2, current: null }),
      ),
      [confirmingOffline, replacedOnline],
    )
  })

  it('restores nothing while offline, and restores the Schedule once the connection returns', async () => {
    vi.mocked(restoreSchedule).mockImplementation(
      answeringOnlyUnderAnyOperation(
        { scheduleId: archived, replacing: null },
        RestoreOutcome.cases.Restored.make({ scheduleId: archived }),
        RestoreOutcome.cases.ScheduleNotFound.make({ scheduleId: archived }),
      ),
    )

    assert.deepStrictEqual(
      await confirmOfflineThenOnline(() =>
        useRestoreSchedule({ scheduleId: archived, current: null }),
      ),
      [confirmingOffline, replacedOnline],
    )
  })
})
