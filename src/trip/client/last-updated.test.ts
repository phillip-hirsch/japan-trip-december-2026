// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { dehydrate, hydrate, onlineManager } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import {
  currentSchedule,
  deferred,
  scheduleId,
} from '@/trip/client/editor-testing'
import {
  loseConnection,
  serverOutOfReach,
  settle,
  testQueryClient,
  withClient,
} from '@/trip/client/hook-testing'
import { useLastUpdated } from '@/trip/client/last-updated'
import type { ScreenQuery } from '@/trip/client/last-updated'
import {
  dayQuery,
  loadQuery,
  scheduleByIdQuery,
  useScheduleSnapshot,
} from '@/trip/client/queries'
import { pageHydrateOptions } from '@/trip/client/query-client'
import {
  answerSnapshot,
  dayPage,
  snapshotWith,
} from '@/trip/client/snapshot-testing'
import { december } from '@/trip/domain/domain'
import type { DayPage, ScheduleSnapshot } from '@/trip/domain/domain'
import {
  getDay,
  getScheduleById,
  getScheduleSnapshot,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay: vi.fn(),
  getScheduleById: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

const tokyoTime = (iso: string) => new Date(`${iso}+09:00`)

/** Sets the device's clock to `iso`, Tokyo time. */
const clockAt = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(tokyoTime(iso))
}

/** Lets the device's clock run on to `iso`, Tokyo time. */
const timePassesTo = (iso: string) =>
  act(async () => {
    vi.advanceTimersByTime(tokyoTime(iso).getTime() - Date.now())
  })

/**
 * What a screen showing when the data of `query` was last updated renders,
 * as the hook returns it, one entry per render.
 */
const lastUpdatedOf = (query: ScreenQuery) => {
  const renders: Array<string | undefined> = []
  const dateTimes: Array<string | undefined> = []

  const Shown = () => {
    const lastUpdated = useLastUpdated(query)
    renders.push(lastUpdated?.text)
    dateTimes.push(lastUpdated?.dateTime)

    return lastUpdated?.text
  }

  return { renders, dateTimes, Shown }
}

/** Opens a screen showing when the data of `query` was last updated. */
const showLastUpdated = async (
  queryClient: QueryClient,
  query: ScreenQuery,
) => {
  const { renders, dateTimes, Shown } = lastUpdatedOf(query)
  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(withClient(queryClient, createElement(Shown))),
  )

  return {
    shown: () => renders.at(-1),
    /** The instant the screen's `<time>` carries. */
    dateTime: () => dateTimes.at(-1),
    close: () => act(async () => root.unmount()),
  }
}

/** The app's root, which keeps the Schedule snapshot, on no page yet. */
const openApp = async (queryClient: QueryClient) => {
  const App = () => {
    useScheduleSnapshot()

    return null
  }

  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(withClient(queryClient, createElement(App))),
  )
  await settle()

  return { close: () => act(async () => root.unmount()) }
}

/** December 14 as the server answers it, read by its page's loader. */
const readDay = async (queryClient: QueryClient) => {
  vi.mocked(getDay).mockResolvedValue(dayPage(december(14)))
  await loadQuery(queryClient, dayQuery(december(14)))
}

afterEach(async () => {
  vi.useRealTimers()
  await clear()
  reportConnection(connected)
  onlineManager.setOnline(true)
  vi.mocked(getDay).mockReset()
})

describe('when a screen was last updated', () => {
  it('reads as just now for a Day the server has just answered', async () => {
    clockAt('2026-12-14T09:00:00')
    const queryClient = testQueryClient()
    await readDay(queryClient)

    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))

    assert.deepStrictEqual(
      { shown: screen.shown(), dateTime: screen.dateTime() },
      { shown: 'Updated just now', dateTime: '2026-12-14T00:00:00.000Z' },
    )
    await screen.close()
  })

  it('moves on while the screen stays open, in its largest whole unit', async () => {
    clockAt('2026-12-14T09:00:00')
    const queryClient = testQueryClient()
    await readDay(queryClient)
    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))

    const shownAt = async (iso: string) => {
      await timePassesTo(iso)

      return screen.shown()
    }

    assert.deepStrictEqual(
      [
        await shownAt('2026-12-14T09:00:59'),
        await shownAt('2026-12-14T09:01:00'),
        await shownAt('2026-12-14T09:59:00'),
        await shownAt('2026-12-14T12:30:00'),
        await shownAt('2026-12-16T10:00:00'),
      ],
      [
        'Updated just now',
        'Updated 1 minute ago',
        'Updated 59 minutes ago',
        'Updated 3 hours ago',
        'Updated 2 days ago',
      ],
    )
    await screen.close()
  })

  it('shows the time of the Schedule snapshot for a Day it filled, not when the Day is opened', async () => {
    clockAt('2026-12-14T09:00:00')
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const queryClient = testQueryClient()
    const app = await openApp(queryClient)

    await timePassesTo('2026-12-14T09:30:00')
    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))

    assert.deepStrictEqual(
      { shown: screen.shown(), dateTime: screen.dateTime() },
      { shown: 'Updated 30 minutes ago', dateTime: '2026-12-14T00:00:00.000Z' },
    )
    await screen.close()
    await app.close()
  })

  it('advances when the Day is read again', async () => {
    clockAt('2026-12-14T09:00:00')
    const queryClient = testQueryClient()
    await readDay(queryClient)
    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))
    await timePassesTo('2026-12-14T09:30:00')

    await act(() => readDay(queryClient))

    assert.strictEqual(screen.shown(), 'Updated just now')
    await screen.close()
  })

  it('keeps the time of the last answer when the Day is read offline', async () => {
    clockAt('2026-12-14T09:00:00')
    const queryClient = testQueryClient()
    await readDay(queryClient)
    await timePassesTo('2026-12-14T09:30:00')

    vi.mocked(getDay).mockImplementation(serverOutOfReach)
    await loadQuery(queryClient, dayQuery(december(14)))
    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated 30 minutes ago')
    await screen.close()
  })

  it('keeps the time of the last answer after the app was closed and reopened offline', async () => {
    clockAt('2026-12-14T09:00:00')
    const before = testQueryClient()
    const keptBefore = keepCacheOnDevice(before)
    await readDay(before)
    await keptBefore.saved()

    await timePassesTo('2026-12-14T11:00:00')
    loseConnection()
    const reopened = testQueryClient()
    keepCacheOnDevice(reopened)
    await loadQuery(reopened, dayQuery(december(14)))
    const screen = await showLastUpdated(reopened, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated 2 hours ago')
    await screen.close()
  })

  it('keeps the time of a Day read when a Schedule snapshot read that started before it answers later', async () => {
    clockAt('2026-12-14T09:00:00')
    const olderSnapshot = deferred<ScheduleSnapshot>()
    vi.mocked(getScheduleSnapshot).mockImplementation(
      () => olderSnapshot.promise,
    )
    const queryClient = testQueryClient()
    const app = await openApp(queryClient)
    await timePassesTo('2026-12-14T09:01:00')
    await readDay(queryClient)

    await timePassesTo('2026-12-14T09:31:00')
    await act(async () =>
      olderSnapshot.resolve(snapshotWith('Onsen at 18:00.')),
    )
    await settle()
    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated 30 minutes ago')
    await screen.close()
    await app.close()
  })

  it('keeps the time of a Schedule snapshot when a Day read that started before it answers later', async () => {
    clockAt('2026-12-14T09:00:00')
    const queryClient = testQueryClient()
    const olderRead = deferred<DayPage>()
    vi.mocked(getDay).mockImplementation(() => olderRead.promise)
    const loading = loadQuery(queryClient, dayQuery(december(14)))
    await timePassesTo('2026-12-14T09:01:00')
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp(queryClient)

    await timePassesTo('2026-12-14T09:31:00')
    await act(async () => olderRead.resolve(dayPage(december(14))))
    await loading
    const screen = await showLastUpdated(queryClient, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated 30 minutes ago')
    await screen.close()
    await app.close()
  })

  it('keeps the time of a read that found the Day unchanged after the app was closed and reopened offline', async () => {
    clockAt('2026-12-14T09:00:00')
    const before = testQueryClient()
    const keptBefore = keepCacheOnDevice(before)
    await readDay(before)
    await keptBefore.saved()
    await timePassesTo('2026-12-14T09:30:00')
    await readDay(before)
    await keptBefore.saved()

    await timePassesTo('2026-12-14T10:00:00')
    loseConnection()
    const reopened = testQueryClient()
    keepCacheOnDevice(reopened)
    await loadQuery(reopened, dayQuery(december(14)))
    const screen = await showLastUpdated(reopened, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated 30 minutes ago')
    await screen.close()
  })

  it('reads as just now for a Day the server rendered into the page, though the device clock runs 10 minutes fast', async () => {
    clockAt('2026-12-14T09:00:00')
    const server = testQueryClient()
    await readDay(server)
    const page = structuredClone(dehydrate(server))

    vi.setSystemTime(tokyoTime('2026-12-14T09:10:00'))
    const browser = testQueryClient()
    hydrate(browser, page, pageHydrateOptions(browser))
    const screen = await showLastUpdated(browser, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated just now')
    await screen.close()
  })

  it('counts from when the browser read a Schedule the server rendered into the page again unchanged, and after a restart', async () => {
    clockAt('2026-12-14T09:00:00')
    vi.mocked(getScheduleById).mockResolvedValue(currentSchedule())
    const schedule = scheduleByIdQuery(scheduleId)
    const server = testQueryClient()
    await loadQuery(server, schedule)
    const page = structuredClone(dehydrate(server))

    const browser = testQueryClient()
    const kept = keepCacheOnDevice(browser)
    hydrate(browser, page, pageHydrateOptions(browser))
    await timePassesTo('2026-12-14T09:30:00')
    await loadQuery(browser, schedule)
    await kept.saved()
    const screen = await showLastUpdated(browser, schedule)
    const readAgain = screen.shown()
    await screen.close()

    await timePassesTo('2026-12-14T09:45:00')
    loseConnection()
    const reopened = testQueryClient()
    keepCacheOnDevice(reopened)
    await loadQuery(reopened, schedule)
    const afterRestart = await showLastUpdated(reopened, schedule)

    assert.deepStrictEqual(
      { readAgain, afterRestart: afterRestart.shown() },
      {
        readAgain: 'Updated just now',
        afterRestart: 'Updated 15 minutes ago',
      },
    )
    await afterRestart.close()
  })

  it('is not shown in a server render or the render hydrating it, though the browser read the Day again before hydrating', async () => {
    clockAt('2026-12-14T09:00:00')
    const server = testQueryClient()
    await readDay(server)
    const serverRender = lastUpdatedOf(dayQuery(december(14)))
    const container = document.createElement('div')
    container.innerHTML = renderToString(
      withClient(server, createElement(serverRender.Shown)),
    )

    // The page's code arrives after a Schedule snapshot read the Day again.
    await timePassesTo('2026-12-14T09:30:00')
    const browser = testQueryClient()
    hydrate(browser, dehydrate(server))
    await readDay(browser)
    const browserRender = lastUpdatedOf(dayQuery(december(14)))
    const mismatches: Array<unknown> = []

    const root = await act(async () =>
      hydrateRoot(
        container,
        withClient(browser, createElement(browserRender.Shown)),
        { onRecoverableError: (error) => mismatches.push(error) },
      ),
    )

    assert.deepStrictEqual(
      {
        server: serverRender.renders,
        hydrating: browserRender.renders[0],
        hydrated: browserRender.renders.at(-1),
        mismatches,
      },
      {
        server: [undefined],
        hydrating: undefined,
        hydrated: 'Updated just now',
        mismatches: [],
      },
    )
    await act(async () => root.unmount())
  })
})
