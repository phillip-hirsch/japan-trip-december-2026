// @vitest-environment happy-dom
import { afterEach, assert, describe, it } from '@effect/vitest'
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  connected,
  offline,
  reportConnection,
} from '@/access/connection-status'
import { testQueryClient } from '@/trip/client/hook-testing'
import {
  dayQuery,
  invalidateAfter,
  loadQuery,
  schedulesQuery,
  useScheduleSnapshot,
} from '@/trip/client/queries'
import { tripDates } from '@/trip/domain/calendar'
import { december, IsoInstant, ScheduleId } from '@/trip/domain/domain'
import type { DayPage, IsoDate, ScheduleSnapshot } from '@/trip/domain/domain'
import { getDay, getScheduleSnapshot } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

const scheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const dayPage = (date: IsoDate, note?: string): DayPage => ({
  scheduleId,
  day: {
    date,
    anchors: [],
    dayTrips: [],
    verifyClaims: [],
    freeDay: false,
    activities: [],
    ...(note !== undefined && { note }),
  },
})

/** A snapshot of Phillip's Schedule whose December 14 has `dayNote`. */
const snapshotWith = (dayNote: string): ScheduleSnapshot => {
  const days = tripDates.map((date) =>
    dayPage(date, date === december(14) ? dayNote : undefined),
  )

  return {
    schedules: {
      current: {
        id: scheduleId,
        status: 'current',
        sourceOptionNumber: 1,
        sourceContentVersion: 'v1',
        chosenAt: IsoInstant.make('2026-10-01T00:00:00.000Z'),
        archivedAt: null,
        birthdayOutline: '',
        sourceItinerary: 'unchanged',
        verifyClaims: [],
        stays: [],
        days: days.map(({ day }) => day),
        anchorWarnings: [],
      },
      archived: [],
      tripNote: 'Pack light.',
    },
    days,
    checklist: { scheduleId, items: [] },
  }
}

const answerSnapshot = (snapshot: ScheduleSnapshot) =>
  vi.mocked(getScheduleSnapshot).mockImplementation(async () => snapshot)

/** A Day read that never reaches the server, as the transport reports it. */
const answerDayOffline = () =>
  vi.mocked(getDay).mockImplementation(async () => {
    reportConnection(offline)
    throw new TypeError('Failed to fetch')
  })

/** Lets pending reads answer and the renders they cause finish. */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

/** The app keeping the Schedule snapshot, as its root does. */
const keepingSnapshot = async (queryClient: QueryClient) => {
  const App = () => {
    useScheduleSnapshot()

    return null
  }

  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(App),
      ),
    ),
  )
  await settle()

  return { close: () => act(async () => root.unmount()) }
}

const storedDay = (queryClient: QueryClient, date: IsoDate) =>
  queryClient.getQueryData(dayQuery(date).queryKey)

afterEach(() => {
  reportConnection(connected)
  onlineManager.setOnline(true)
  vi.mocked(getDay).mockReset()
})

describe('the Schedule snapshot', () => {
  it('stores the Schedules and every Day page, before any Day is opened', async () => {
    const snapshot = snapshotWith('Onsen at 18:00.')
    answerSnapshot(snapshot)
    const queryClient = testQueryClient()
    const app = await keepingSnapshot(queryClient)

    assert.deepStrictEqual(
      {
        schedules: queryClient.getQueryData(schedulesQuery.queryKey),
        days: tripDates.map((date) => storedDay(queryClient, date)),
      },
      { schedules: snapshot.schedules, days: snapshot.days },
    )
    await app.close()
  })

  it('stores every Day again after a write, including Days not on screen', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const queryClient = testQueryClient()
    const app = await keepingSnapshot(queryClient)

    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await act(() => invalidateAfter(queryClient, 'dayNote'))
    await settle()

    assert.strictEqual(
      storedDay(queryClient, december(14))?.day.note,
      'Onsen moved to 20:00.',
    )
    await app.close()
  })
})

describe('loadQuery', () => {
  it('answers offline with a Day the snapshot stored, though it was never opened', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const queryClient = testQueryClient()
    const app = await keepingSnapshot(queryClient)
    answerDayOffline()

    const page = await loadQuery(queryClient, dayQuery(december(14)))

    assert.strictEqual(page?.day.note, 'Onsen at 18:00.')
    await app.close()
  })

  it('answers with the stored Day while the browser is offline, without waiting for the network', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const queryClient = testQueryClient()
    const app = await keepingSnapshot(queryClient)
    onlineManager.setOnline(false)

    const page = await loadQuery(queryClient, dayQuery(december(14)))

    assert.strictEqual(page?.day.note, 'Onsen at 18:00.')
    await app.close()
  })

  it('fails offline for a Day with nothing stored', async () => {
    const queryClient = testQueryClient()
    answerDayOffline()

    const read = await loadQuery(queryClient, dayQuery(december(14))).then(
      () => 'answered',
      () => 'failed',
    )

    assert.strictEqual(read, 'failed')
  })

  it('answers online with the Day as the server reads it now, not the stored one', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const queryClient = testQueryClient()
    const app = await keepingSnapshot(queryClient)

    vi.mocked(getDay).mockImplementation(async () =>
      dayPage(december(14), 'Written on another device.'),
    )

    const page = await loadQuery(queryClient, dayQuery(december(14)))

    assert.strictEqual(page?.day.note, 'Written on another device.')
    await app.close()
  })
})
