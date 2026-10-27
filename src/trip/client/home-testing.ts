import {
  dehydrate,
  hashKey,
  hydrate,
  onlineManager,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { useDayNote } from '@/components/notes'
import { openEditor } from '@/trip/client/editor-testing'
import { testQueryClient, withClient } from '@/trip/client/hook-testing'
import { pageHydrateOptions } from '@/trip/client/query-client'
import {
  homeQuery,
  loadQuery,
  shouldDehydrateQuery,
  useHome,
  useScheduleSnapshot,
} from '@/trip/client/queries'
import { snapshotWith } from '@/trip/client/snapshot-testing'
import { december, HomeState, WriteDayNoteOutcome } from '@/trip/domain/domain'
import type { IsoDate, ScheduleSnapshot } from '@/trip/domain/domain'
import { tokyoDateAt } from '@/trip/domain/calendar'
import { getHome, getSchedules, writeDayNote } from '@/trip/trip/trip.functions'

// What Home's hook tests share: the device's clock, the app's roots, and Home
// and the Schedule snapshot as the server answers them. A test file using it
// mocks `@/trip/trip/trip.functions` and runs `closeHome` after each test.
// Saves go through the editors' own hooks, as they do on their pages.

export const tokyoTime = (iso: string) => new Date(`${iso}+09:00`)

// How far the device's clock runs ahead of the server's, negative for behind.
let deviceAhead = 0

/**
 * Sets the server's clock to `iso`, Tokyo time, and the device's `ahead`
 * milliseconds ahead of it, or behind when negative, and lets both run.
 */
export const clockAt = (iso: string, ahead = 0) => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
    shouldAdvanceTime: true,
  })
  deviceAhead = ahead
  vi.setSystemTime(tokyoTime(iso).getTime() + ahead)
}

/** Lets both clocks run on until the server's reads `iso`, Tokyo time. */
export const timePassesTo = (iso: string) =>
  act(() =>
    vi.advanceTimersByTimeAsync(
      tokyoTime(iso).getTime() + deviceAhead - Date.now(),
    ),
  )

/** The server's clock now, which runs `deviceAhead` behind the device's. */
const serverNow = () => new Date(Date.now() - deviceAhead)

/** Runs `render` as the server does, with the time by its own clock. */
const onServer = async <T>(render: () => Promise<T>) => {
  const ahead = deviceAhead
  vi.setSystemTime(serverNow())
  deviceAhead = 0

  try {
    return await render()
  } finally {
    deviceAhead = ahead
    vi.setSystemTime(Date.now() + ahead)
  }
}

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

/** Home as the server reads it during the Trip, at `readAt`. */
const homeReadDuringTrip = (readAt: Date) =>
  HomeState.cases.DuringTrip.make({
    readAt: readAt.toISOString(),
    ...todayOn(Number(tokyoDateAt(readAt.getTime()).slice(8, 10))),
  })

/** Home as the server reads it during the Trip, at `iso` Tokyo time. */
export const homeDuringTrip = (iso: string) =>
  homeReadDuringTrip(tokyoTime(iso))

/** Home as the server reads it on December 5, the day before the Trip. */
export const homeBeforeTrip = HomeState.cases.BeforeTrip.make({
  readAt: tokyoTime('2026-12-05T22:00:00').toISOString(),
  daysToGo: 1,
  schedule: snapshot.schedules.current,
})

export const answerHome = (home: HomeState) =>
  vi.mocked(getHome).mockResolvedValue(home)

/** The server answers each read of Home during the Trip by its own clock. */
export const serverReadsHome = () =>
  vi
    .mocked(getHome)
    .mockImplementation(async () => homeReadDuringTrip(serverNow()))

/** Shows Home on `queryClient`, keeping the hook's answer per render. */
const showHome = async (queryClient: QueryClient) => {
  const renders: Array<ReturnType<typeof useHome>> = []

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
 * Opens Home as the app does: its loader reads Home, and the root keeps the
 * Schedule snapshot. The hook's answer is kept per render.
 */
export const openHome = async (queryClient: QueryClient) => {
  await loadQuery(queryClient, homeQuery)

  return showHome(queryClient)
}

/** `app` with a `close` that first waits until what `kept` keeps is saved. */
const closingFully = <App extends { close: () => Promise<void> }>(
  app: App,
  kept: ReturnType<typeof keepCacheOnDevice>,
) => ({
  ...app,
  close: async () => {
    await act(() => kept.saved())
    await app.close()
  },
})

/**
 * Opens Home from cold, as the Home Screen app does, on a cache the device
 * keeps. `close` closes the app fully, once what it keeps is on the device.
 */
export const openHomeFromCold = async () => {
  const queryClient = testQueryClient()
  const kept = keepCacheOnDevice(queryClient)

  return closingFully(await openHome(queryClient), kept)
}

/**
 * Opens a page the server rendered with Home in it, read by the server's
 * clock, on a cache the device keeps. The browser takes in the page's Home as
 * the router does, and shows it without reading Home again.
 */
export const openHomeRenderedIntoPage = async () => {
  const page = await onServer(async () => {
    const server = testQueryClient()
    await loadQuery(server, homeQuery)

    // The page carries a copy, as it does across the network.
    return structuredClone(dehydrate(server, { shouldDehydrateQuery }))
  })

  const queryClient = testQueryClient()
  const kept = keepCacheOnDevice(queryClient)
  hydrate(queryClient, page, pageHydrateOptions(queryClient))

  return closingFully(await showHome(queryClient), kept)
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

/** Today on December `day`, as the Schedule snapshot stored it. */
export const todayOn = (day: number) => {
  const date = december(day)

  return { date, today: dayPageIn(snapshot, date) }
}

/** The Day page `from` holds for `date`. */
const dayPageIn = (from: ScheduleSnapshot, date: IsoDate) => {
  const page = from.days.find(({ day }) => day.date === date)

  if (page === undefined) throw new Error(`The snapshot has no ${date}`)

  return page
}

/**
 * Opens December 14's Day note editor, as its Day page does, on a new query
 * client. The page reads the Schedules of `snapshot`.
 */
export const openDayNote = () => {
  vi.mocked(getSchedules).mockResolvedValue(snapshot.schedules)

  return openEditor(useDayNote, { date: december(14), note: undefined }, () =>
    getSchedules(),
  )
}

/** Saves `note` in the Day note editor, as Phillip does, and the server takes it. */
export const saveDayNote = async (
  editor: Awaited<ReturnType<typeof openDayNote>>,
  note: string,
) => {
  vi.mocked(writeDayNote).mockResolvedValue(
    WriteDayNoteOutcome.cases.Written.make({}),
  )
  await act(async () => editor.field().change(note))
  await act(() => editor.field().save())
  await settle()
}

/**
 * Unmounts what a test left open, such as after a failed assertion, and puts
 * the clock, the device's storage, Home's answer and the connection back.
 */
export const closeHome = async () => {
  await act(async () => {
    openRoots.forEach((root) => root.unmount())
    openRoots.clear()
  })
  vi.useRealTimers()
  deviceAhead = 0
  await clear()
  // A read still pending from this test runs again when the connection
  // returns. Reset Home's answer first, so that read can't call this test's
  // mock and report the app offline.
  vi.mocked(getHome).mockReset()
  reportConnection(connected)
  onlineManager.setOnline(true)
}
