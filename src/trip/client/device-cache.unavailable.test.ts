// @vitest-environment happy-dom
import { afterEach, assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'

import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { testQueryClient } from '@/trip/client/hook-testing'
import { dayQuery, loadQuery } from '@/trip/client/queries'
import { dayPage } from '@/trip/client/snapshot-testing'
import { december } from '@/trip/domain/domain'
import { getDay } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

/** Opens the app online and loads December 14, as its page does. */
const openDayOnline = () => {
  vi.mocked(getDay).mockResolvedValue(dayPage(december(14), 'Onsen at 18:00.'))
  const queryClient = testQueryClient()
  keepCacheOnDevice(queryClient)

  return loadQuery(queryClient, dayQuery(december(14)))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// The storage module remembers the first database it opens, so the browser
// that refuses IndexedDB comes before the one whose IndexedDB never answers.
describe('the app on a device that keeps nothing', () => {
  it('opens a Day online when the browser refuses IndexedDB', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('Storage disabled', 'SecurityError')
      },
    })

    assert.strictEqual((await openDayOnline())?.day.note, 'Onsen at 18:00.')
  })

  it('opens a Day online when IndexedDB never answers', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    // An open request that never succeeds or fails, as when another tab
    // blocks the database.
    vi.stubGlobal('indexedDB', { open: () => ({}) })

    const page = openDayOnline()
    await vi.advanceTimersByTimeAsync(10_000)

    assert.strictEqual((await page)?.day.note, 'Onsen at 18:00.')
  })
})
