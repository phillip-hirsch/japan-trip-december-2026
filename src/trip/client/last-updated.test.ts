// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import {
  dehydrate,
  hydrate,
  onlineManager,
  QueryClientProvider,
} from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import {
  connected,
  offline,
  reportConnection,
} from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import {
  serverOutOfReach,
  settle,
  testQueryClient,
} from '@/trip/client/hook-testing'
import { useLastUpdated } from '@/trip/client/last-updated'
import { dayQuery, loadQuery, useScheduleSnapshot } from '@/trip/client/queries'
import {
  answerSnapshot,
  dayPage,
  snapshotWith,
} from '@/trip/client/snapshot-testing'
import { december } from '@/trip/domain/domain'
import { getDay } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay: vi.fn(),
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

const withClient = (queryClient: QueryClient, children: ReactNode) =>
  createElement(QueryClientProvider, { client: queryClient }, children)

/**
 * What a screen showing when the data of `query` was last updated renders,
 * as the hook returns it, one entry per render.
 */
const lastUpdatedOf = (query: { readonly queryKey: QueryKey }) => {
  const renders: Array<string | undefined> = []

  const Shown = () => {
    const text = useLastUpdated(query)?.text
    renders.push(text)

    return text
  }

  return { renders, Shown }
}

/** Opens a screen showing when the data of `query` was last updated. */
const showLastUpdated = async (
  queryClient: QueryClient,
  query: { readonly queryKey: QueryKey },
) => {
  const { renders, Shown } = lastUpdatedOf(query)
  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(withClient(queryClient, createElement(Shown))),
  )

  return {
    shown: () => renders.at(-1),
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

const goOffline = () => {
  onlineManager.setOnline(false)
  reportConnection(offline)
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

    assert.strictEqual(screen.shown(), 'Updated just now')
    await screen.close()
  })

  it('ages while the screen stays open, in its largest whole unit', async () => {
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

    assert.strictEqual(screen.shown(), 'Updated 30 minutes ago')
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
    goOffline()
    const reopened = testQueryClient()
    keepCacheOnDevice(reopened)
    await loadQuery(reopened, dayQuery(december(14)))
    const screen = await showLastUpdated(reopened, dayQuery(december(14)))

    assert.strictEqual(screen.shown(), 'Updated 2 hours ago')
    await screen.close()
  })

  it('reads as just now in a server render and the render hydrating it, then shows its age', async () => {
    clockAt('2026-12-14T09:00:00')
    const server = testQueryClient()
    await readDay(server)
    await timePassesTo('2026-12-14T09:30:00')
    const serverRender = lastUpdatedOf(dayQuery(december(14)))
    const container = document.createElement('div')
    container.innerHTML = renderToString(
      withClient(server, createElement(serverRender.Shown)),
    )

    const browser = testQueryClient()
    hydrate(browser, dehydrate(server))
    const browserRender = lastUpdatedOf(dayQuery(december(14)))

    const root = await act(async () =>
      hydrateRoot(
        container,
        withClient(browser, createElement(browserRender.Shown)),
      ),
    )

    assert.deepStrictEqual(
      {
        server: serverRender.renders,
        hydrating: browserRender.renders[0],
        hydrated: browserRender.renders.at(-1),
      },
      {
        server: ['Updated just now'],
        hydrating: 'Updated just now',
        hydrated: 'Updated 30 minutes ago',
      },
    )
    await act(async () => root.unmount())
  })
})
