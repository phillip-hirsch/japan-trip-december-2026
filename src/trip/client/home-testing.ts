import { hashKey, onlineManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { currentSchedule, scheduleId } from '@/trip/client/editor-testing'
import { testQueryClient, withClient } from '@/trip/client/hook-testing'
import {
  homeQuery,
  loadQuery,
  useHome,
  useScheduleSnapshot,
} from '@/trip/client/queries'
import { snapshotWith } from '@/trip/client/snapshot-testing'
import {
  december,
  HomeState,
  IsoInstant,
  ScheduleId,
} from '@/trip/domain/domain'
import { getHome } from '@/trip/trip/trip.functions'

// What Home's hook tests share: the device's clock, the app's roots, and Home
// and the Schedule snapshot as the server answers them. A test file using it
// mocks `@/trip/trip/trip.functions` and runs `closeHome` after each test.

export const otherScheduleId = ScheduleId.make(
  '00000000-0000-4000-8000-00000000000b',
)

export const tokyoTime = (iso: string) => new Date(`${iso}+09:00`)

/** Sets the device's clock to `iso`, Tokyo time, and lets it run. */
export const clockAt = (iso: string) => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
    shouldAdvanceTime: true,
  })
  vi.setSystemTime(tokyoTime(iso))
}

/** Lets the device's clock run on to `iso`, Tokyo time. */
export const timePassesTo = (iso: string) =>
  act(() => vi.advanceTimersByTimeAsync(tokyoTime(iso).getTime() - Date.now()))

/** Lets pending reads answer and the renders they cause finish. */
export const settle = () => act(() => vi.advanceTimersByTimeAsync(0))

// Roots still open when a test ends, such as after a failed assertion, so
// one failure can't spill into the next test.
const openRoots = new Set<Root>()

const openedRoot = () => {
  const root = createRoot(document.createElement('div'))
  openRoots.add(root)

  return root
}

const closeRoot = (root: Root) =>
  act(async () => {
    openRoots.delete(root)
    root.unmount()
  })

export const snapshot = snapshotWith('Onsen at 18:00.')

/** Home as the server reads it during the Trip, at `iso` Tokyo time. */
export const homeDuringTrip = (iso: string) => {
  const readAt = tokyoTime(iso)

  return HomeState.cases.DuringTrip.make({
    readAt: readAt.toISOString(),
    itineraries: [],
    ...todayOn(Number(iso.slice(8, 10))),
  })
}

/** Home as the server reads it on December 5, the day before the Trip. */
export const homeBeforeTrip = HomeState.cases.BeforeTrip.make({
  readAt: tokyoTime('2026-12-05T22:00:00').toISOString(),
  itineraries: [],
  daysToGo: 1,
  schedule: snapshot.schedules.current,
})

export const answerHome = (home: HomeState) =>
  vi.mocked(getHome).mockResolvedValue(home)

/**
 * Opens Home as the app does: its loader reads Home, and the root keeps the
 * Schedule snapshot. The hook's answer is kept per render.
 */
export const openHome = async (queryClient: QueryClient) => {
  const renders: Array<ReturnType<typeof useHome>> = []
  await loadQuery(queryClient, homeQuery)

  const App = () => {
    useScheduleSnapshot()
    renders.push(useHome())

    return null
  }

  const root = openedRoot()
  await act(async () =>
    root.render(withClient(queryClient, createElement(App))),
  )
  await settle()

  return {
    /** What Home shows now, and which query its data came from. */
    shown: () => {
      const last = renders.at(-1)

      return last && { home: last.home, from: hashKey(last.query.queryKey) }
    },
    close: () => closeRoot(root),
  }
}

/**
 * Opens Home from cold, as the Home Screen app does, on a cache the device
 * keeps. `close` closes the app fully, once what it keeps is on the device.
 */
export const openHomeFromCold = async () => {
  const queryClient = testQueryClient()
  const kept = keepCacheOnDevice(queryClient)
  const app = await openHome(queryClient)

  return {
    ...app,
    close: async () => {
      await act(() => kept.saved())
      await app.close()
    },
  }
}

/** The app's root, which keeps the Schedule snapshot, on no page. */
export const openRoot = async (queryClient: QueryClient) => {
  const Root = () => {
    useScheduleSnapshot()

    return null
  }

  const root = openedRoot()
  await act(async () =>
    root.render(withClient(queryClient, createElement(Root))),
  )
  await settle()

  return { close: () => closeRoot(root) }
}

/**
 * Option 1's Schedule as the Schedules list it once Option 2 replaced it at
 * 20:30 on December 14 in Tokyo, by the server's clock.
 */
export const option1Archived = {
  id: scheduleId,
  sourceOptionNumber: 1,
  chosenAt: currentSchedule().chosenAt,
  archivedAt: IsoInstant.make(tokyoTime('2026-12-14T20:30:00').toISOString()),
}

/** The snapshot once the Schedule chosen from Option 2 replaced Option 1's. */
export const option2Snapshot = {
  ...snapshot,
  schedules: {
    ...snapshot.schedules,
    current: currentSchedule({
      id: otherScheduleId,
      sourceOptionNumber: 2,
      days: snapshot.days.map(({ day }) => day),
    }),
    archived: [option1Archived],
  },
  days: snapshot.days.map((page) => ({ ...page, scheduleId: otherScheduleId })),
}

/** Today on December `day`, as the Schedule snapshot stored it. */
export const todayOn = (day: number) => {
  const date = december(day)

  return {
    date,
    today: snapshot.days.find((page) => page.day.date === date) ?? null,
  }
}

/**
 * Unmounts what a test left open, such as after a failed assertion, and puts
 * the clock, the device's storage and the connection back.
 */
export const closeHome = async () => {
  await act(async () => {
    openRoots.forEach((root) => root.unmount())
    openRoots.clear()
  })
  vi.useRealTimers()
  await clear()
  reportConnection(connected)
  onlineManager.setOnline(true)
  vi.mocked(getHome).mockReset()
}
