// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import {
  dehydrate,
  focusManager,
  hydrate,
  onlineManager,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { DehydratedState } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  connected,
  offline,
  reportConnection,
} from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import {
  outcomeOf,
  serverOutOfReach,
  settle,
  testQueryClient,
} from '@/trip/client/hook-testing'
import {
  dayQuery,
  loadQuery,
  schedulesQuery,
  useScheduleSnapshot,
} from '@/trip/client/queries'
import {
  answerSnapshot,
  dayPage,
  snapshotWith,
} from '@/trip/client/snapshot-testing'
import { december } from '@/trip/domain/domain'
import type { IsoDate } from '@/trip/domain/domain'
import {
  getDay,
  getSchedules,
  getScheduleSnapshot,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay: vi.fn(),
  getSchedules: vi.fn(),
  getScheduleSnapshot: vi.fn(),
}))

interface Opening {
  /** The version of the data the app keeps. */
  readonly version?: number
  /** What a page the server rendered carries. */
  readonly serverRendered?: DehydratedState
  /** The Day on screen, if any. */
  readonly shownDay?: IsoDate
}

/**
 * Opens the app from cold, as the Home Screen app does: a new cache that
 * keeps what it holds on the device, and a root that keeps the Schedule
 * snapshot. The router puts what a server-rendered page carries in the
 * cache before the app renders.
 */
const openApp = async ({ version, serverRendered, shownDay }: Opening = {}) => {
  const queryClient = testQueryClient()
  const kept = keepCacheOnDevice(queryClient, version)

  if (serverRendered !== undefined) hydrate(queryClient, serverRendered)
  const root = createRoot(document.createElement('div'))

  const App = () => {
    useScheduleSnapshot()

    return null
  }

  const Day = ({ date }: { readonly date: IsoDate }) => {
    useQuery(dayQuery(date))

    return null
  }

  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(App),
        shownDay !== undefined && createElement(Day, { date: shownDay }),
      ),
    ),
  )
  await settle()
  await act(() => kept.saved())

  return {
    queryClient,
    /** Closes the app fully, once what it keeps is on the device. */
    close: async () => {
      await act(() => kept.saved())
      await act(async () => root.unmount())
    },
  }
}

type App = Awaited<ReturnType<typeof openApp>>

const goOffline = () => {
  onlineManager.setOnline(false)
  reportConnection(offline)
}

/** The Day note December 14 opens with, offline. */
const dayNoteOffline = async (app: App) =>
  (await loadQuery(app.queryClient, dayQuery(december(14))))?.day.note

/** A server-rendered page that carries December 14 with `note`. */
const serverRenderedWith = (note: string) => {
  const server = testQueryClient()
  server.setQueryData(
    dayQuery(december(14)).queryKey,
    dayPage(december(14), note),
  )

  return dehydrate(server)
}

const answerNoSnapshot = () =>
  vi.mocked(getScheduleSnapshot).mockImplementation(() => new Promise(() => {}))

const tokyoTime = (iso: string) => new Date(`${iso}+09:00`)

afterEach(async () => {
  vi.useRealTimers()
  await clear()
  reportConnection(connected)
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
  vi.mocked(getDay).mockReset()
})

describe('what the device keeps', () => {
  it('opens the Schedules and any Day offline after the app was closed', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp()).close()

    goOffline()
    const app = await openApp()

    assert.deepStrictEqual(
      {
        tripNote: (await loadQuery(app.queryClient, schedulesQuery)).tripNote,
        dayNote: await dayNoteOffline(app),
      },
      { tripNote: 'Pack light.', dayNote: 'Onsen at 18:00.' },
    )
    await app.close()
  })

  it('still opens any Day offline on the last evening of the Trip, with the app open unused since October and after it was closed', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    vi.setSystemTime(tokyoTime('2026-10-21T09:00:00'))
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const october = await openApp()

    goOffline()
    await act(() =>
      vi.advanceTimersByTimeAsync(
        tokyoTime('2026-12-20T23:30:00').getTime() - Date.now(),
      ),
    )
    const whileOpen = await dayNoteOffline(october)
    await october.close()
    const reopened = await openApp()

    assert.deepStrictEqual(
      { whileOpen, reopened: await dayNoteOffline(reopened) },
      { whileOpen: 'Onsen at 18:00.', reopened: 'Onsen at 18:00.' },
    )
    await reopened.close()
  })

  it('keeps the Day the first server-rendered page carried, though no snapshot answered', async () => {
    answerNoSnapshot()
    await (
      await openApp({ serverRendered: serverRenderedWith('Arrive at Haneda.') })
    ).close()

    goOffline()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Arrive at Haneda.')
    await app.close()
  })

  it('opens the Day the server rendered, not an older kept one, though the device clock runs ahead', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // The device's clock runs two hours fast.
    vi.setSystemTime(tokyoTime('2026-10-22T09:00:00'))
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp()).close()

    // An hour later, the server renders December 14 by its own clock.
    vi.setSystemTime(tokyoTime('2026-10-22T08:00:00'))
    answerNoSnapshot()

    const app = await openApp({
      serverRendered: serverRenderedWith('Onsen moved to 20:00.'),
    })

    goOffline()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })

  it('still opens a shown Day offline after reading it again failed', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp()).close()

    // The server is out of reach, though the browser reports a network.
    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)
    vi.mocked(getDay).mockImplementation(serverOutOfReach)
    const shown = await openApp({ shownDay: december(14) })
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await settle()
    await shown.close()

    goOffline()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen at 18:00.')
    await app.close()
  })

  it('keeps the Day a later app saved when an earlier one, still open in another tab, saves after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(tokyoTime('2026-10-21T09:00:00'))
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const earlier = await openApp()

    vi.setSystemTime(tokyoTime('2026-10-21T10:00:00'))
    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await (await openApp()).close()

    vi.setSystemTime(tokyoTime('2026-10-21T11:00:00'))
    vi.mocked(getSchedules).mockResolvedValue(
      snapshotWith('Onsen at 18:00.').schedules,
    )
    await loadQuery(earlier.queryClient, schedulesQuery)
    await earlier.close()

    goOffline()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })

  it('discards what an older version of the app kept, instead of reading it', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp({ version: 1 })).close()

    goOffline()
    const app = await openApp({ version: 2 })

    assert.strictEqual(
      await outcomeOf(loadQuery(app.queryClient, dayQuery(december(14)))),
      'failed',
    )
    await app.close()
  })

  it('keeps what a newer version kept when an older version, still open in another tab, saves after it', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const older = await openApp({ version: 1 })

    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await (await openApp({ version: 2 })).close()

    vi.mocked(getSchedules).mockResolvedValue(
      snapshotWith('Onsen at 18:00.').schedules,
    )
    await loadQuery(older.queryClient, schedulesQuery)
    await older.close()

    goOffline()
    const app = await openApp({ version: 2 })

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })
})
