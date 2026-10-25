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

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { deferred } from '@/trip/client/editor-testing'
import {
  loseConnection,
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
import type { DayPage, IsoDate, ScheduleSnapshot } from '@/trip/domain/domain'
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
  /** Runs as the restore puts the first kept Day back. */
  readonly onRestoringDay?: () => void
}

/**
 * Opens the app from cold, as the Home Screen app does. It makes a new cache
 * that keeps what it holds on the device, and renders a root that keeps the
 * Schedule snapshot. The router puts what a server-rendered page carries in
 * the cache before the app renders.
 */
const openApp = async ({
  version,
  serverRendered,
  shownDay,
  onRestoringDay,
}: Opening = {}) => {
  const queryClient = testQueryClient()

  if (onRestoringDay !== undefined) {
    const stop = queryClient.getQueryCache().subscribe(({ type, query }) => {
      if (type !== 'added' || query.queryKey[0] !== 'days') return

      stop()
      onRestoringDay()
    })
  }

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

    loseConnection()
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

    loseConnection()
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

    loseConnection()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Arrive at Haneda.')
    await app.close()
  })

  it('opens the Day the server rendered, not an older kept one, though the device clock runs ahead, and after the app was closed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // The device's clock runs two hours fast.
    vi.setSystemTime(tokyoTime('2026-10-22T09:00:00'))
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp()).close()

    // An hour later, the server renders December 14 by its own clock.
    vi.setSystemTime(tokyoTime('2026-10-22T08:00:00'))
    answerNoSnapshot()

    const rendered = await openApp({
      serverRendered: serverRenderedWith('Onsen moved to 20:00.'),
    })

    loseConnection()
    const whileOpen = await dayNoteOffline(rendered)
    await rendered.close()
    const reopened = await openApp()

    assert.deepStrictEqual(
      { whileOpen, reopened: await dayNoteOffline(reopened) },
      { whileOpen: 'Onsen moved to 20:00.', reopened: 'Onsen moved to 20:00.' },
    )
    await reopened.close()
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

    loseConnection()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen at 18:00.')
    await app.close()
  })

  it('keeps the Day a later app saved when an earlier one, still open in another tab, saves after it, even in the same millisecond', async () => {
    // The clock stands still, so every read in this test gets the same date.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(tokyoTime('2026-10-21T09:00:00'))
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const earlier = await openApp()

    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await (await openApp()).close()

    vi.mocked(getSchedules).mockResolvedValue(
      snapshotWith('Onsen at 18:00.').schedules,
    )
    await loadQuery(earlier.queryClient, schedulesQuery)
    await earlier.close()

    loseConnection()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })

  it('keeps the Day another tab saved when a read of that Day from before answers late here', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const earlier = await openApp()
    const lateRead = deferred<DayPage>()
    vi.mocked(getDay).mockImplementation(() => lateRead.promise)
    const reading = loadQuery(earlier.queryClient, dayQuery(december(14)))
    // Focus reads the snapshot after that read started, so its Day counts
    // as the later read.
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await settle()

    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await (await openApp()).close()
    await act(async () =>
      lateRead.resolve(dayPage(december(14), 'Onsen at 17:00.')),
    )
    await reading
    await earlier.close()

    loseConnection()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })

  it('keeps what a snapshot stores as the restore puts kept Days back', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp()).close()

    const snapshot = deferred<ScheduleSnapshot>()
    vi.mocked(getScheduleSnapshot).mockImplementation(() => snapshot.promise)
    await (
      await openApp({
        onRestoringDay: () =>
          snapshot.resolve(snapshotWith('Onsen moved to 20:00.')),
      })
    ).close()

    loseConnection()
    const app = await openApp()

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })

  it('discards what an older version of the app kept, instead of reading it', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp({ version: 1 })).close()

    loseConnection()
    const app = await openApp({ version: 2 })

    assert.strictEqual(
      await outcomeOf(loadQuery(app.queryClient, dayQuery(december(14)))),
      'failed',
    )
    await app.close()
  })

  it('discards what the app kept while Home still listed the Itineraries', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    await (await openApp({ version: 1 })).close()

    loseConnection()
    const app = await openApp()

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

    loseConnection()
    const app = await openApp({ version: 2 })

    assert.strictEqual(await dayNoteOffline(app), 'Onsen moved to 20:00.')
    await app.close()
  })
})
