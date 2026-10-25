// @vitest-environment happy-dom
import { afterEach, assert, describe, it } from '@effect/vitest'
import { focusManager, onlineManager, useQuery } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { connected, reportConnection } from '@/access/connection-status'
import { useDayNote } from '@/components/notes'
import { deferred, openEditor, scheduleId } from '@/trip/client/editor-testing'
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
import { tripDates } from '@/trip/domain/calendar'
import { december, WriteDayNoteOutcome } from '@/trip/domain/domain'
import type { DayPage, IsoDate, ScheduleSnapshot } from '@/trip/domain/domain'
import {
  getDay,
  getScheduleSnapshot,
  writeDayNote,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay: vi.fn(),
  getScheduleSnapshot: vi.fn(),
  writeDayNote: vi.fn(),
}))

/** A Day read that never reaches the server, as the transport reports it. */
const answerDayOffline = () =>
  vi.mocked(getDay).mockImplementation(serverOutOfReach)

/**
 * The app keeping the Schedule snapshot, as its root does, on December 7's
 * Day page with its Day note editor. Every other Day is off screen. The page
 * reads the Schedules with `readSchedules`.
 */
const openApp = async (readSchedules?: () => Promise<string>) => {
  const app = await openEditor(
    () => {
      useScheduleSnapshot()

      return useDayNote({ scheduleId, date: december(7), note: undefined })
    },
    {},
    readSchedules,
  )

  await settle()

  return app
}

type App = Awaited<ReturnType<typeof openApp>>

const storedDay = (app: App, date: IsoDate) =>
  app.queryClient.getQueryData(dayQuery(date).queryKey)

/** Saves a Day note on December 7, as Phillip does in its editor. */
const saveDayNote = async (app: App) => {
  vi.mocked(writeDayNote).mockResolvedValue(
    WriteDayNoteOutcome.cases.Written.make({}),
  )
  await act(async () => app.field().change('Tsukiji at dawn.'))
  await act(() => app.field().save())
  await settle()
}

afterEach(() => {
  localStorage.clear()
  reportConnection(connected)
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
  vi.mocked(getDay).mockReset()
})

describe('the Schedule snapshot', () => {
  it('stores the Schedules and every Day page, before any Day is opened', async () => {
    const snapshot = snapshotWith('Onsen at 18:00.')
    answerSnapshot(snapshot)
    // The page's own read of the Schedules never answers, so only the
    // snapshot stores them.
    const app = await openApp(() => new Promise<string>(() => {}))

    assert.deepStrictEqual(
      {
        schedules: app.queryClient.getQueryData(schedulesQuery.queryKey),
        days: tripDates.map((date) => storedDay(app, date)),
      },
      { schedules: snapshot.schedules, days: snapshot.days },
    )
    await app.close()
  })

  it('stores every Day again after a save, including Days not on screen', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp()

    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await saveDayNote(app)

    assert.strictEqual(
      storedDay(app, december(14))?.day.note,
      'Onsen moved to 20:00.',
    )
    await app.close()
  })

  it('keeps the Day it stored after a save when a read of that Day from before the save answers late', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp()
    const beforeSave = deferred<DayPage>()
    vi.mocked(getDay).mockImplementation(() => beforeSave.promise)
    const preloaded = loadQuery(app.queryClient, dayQuery(december(14)))

    answerSnapshot(snapshotWith('Onsen moved to 20:00.'))
    await saveDayNote(app)
    await act(async () =>
      beforeSave.resolve(dayPage(december(14), 'Onsen at 18:00.')),
    )

    assert.deepStrictEqual(
      {
        loaded: (await preloaded)?.day.note,
        stored: storedDay(app, december(14))?.day.note,
      },
      { loaded: 'Onsen moved to 20:00.', stored: 'Onsen moved to 20:00.' },
    )
    await app.close()
  })

  it('keeps a Day read that started after the snapshot read, though the snapshot answers later', async () => {
    const olderSnapshot = deferred<ScheduleSnapshot>()
    vi.mocked(getScheduleSnapshot).mockImplementation(
      () => olderSnapshot.promise,
    )
    const app = await openApp()
    vi.mocked(getDay).mockImplementation(async () =>
      dayPage(december(14), 'Written on another device.'),
    )
    await loadQuery(app.queryClient, dayQuery(december(14)))

    await act(async () =>
      olderSnapshot.resolve(snapshotWith('Onsen at 18:00.')),
    )
    await settle()

    assert.strictEqual(
      storedDay(app, december(14))?.day.note,
      'Written on another device.',
    )
    await app.close()
  })

  it('keeps the Day it stored after a save when a read of that Day from before the save answers in the same moment', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp()
    const beforeSave = deferred<DayPage>()
    vi.mocked(getDay).mockImplementation(() => beforeSave.promise)
    const preloaded = loadQuery(app.queryClient, dayQuery(december(14)))
    const afterSave = deferred<ScheduleSnapshot>()
    vi.mocked(getScheduleSnapshot).mockImplementation(() => afterSave.promise)
    await saveDayNote(app)

    await act(async () => {
      beforeSave.resolve(dayPage(december(14), 'Onsen at 18:00.'))
      afterSave.resolve(snapshotWith('Onsen moved to 20:00.'))
    })
    await settle()

    assert.deepStrictEqual(
      {
        loaded: (await preloaded)?.day.note,
        stored: storedDay(app, december(14))?.day.note,
      },
      { loaded: 'Onsen moved to 20:00.', stored: 'Onsen moved to 20:00.' },
    )
    await app.close()
  })
})

describe('a loader', () => {
  it('answers with the Day a snapshot stores after the app went offline during its read', async () => {
    const snapshot = deferred<ScheduleSnapshot>()
    vi.mocked(getScheduleSnapshot).mockImplementation(() => snapshot.promise)
    const app = await openApp()
    vi.mocked(getDay).mockImplementation(() => deferred<DayPage>().promise)
    const loading = loadQuery(app.queryClient, dayQuery(december(14)))

    loseConnection()
    await act(async () => snapshot.resolve(snapshotWith('Onsen at 18:00.')))

    assert.strictEqual((await loading)?.day.note, 'Onsen at 18:00.')
    await app.close()
  })

  it('answers with the stored Day when the app goes offline during a read of it already under way', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))

    // December 14 is shown, and retries a failed read as the app does.
    const app = await openEditor(() => {
      useScheduleSnapshot()
      useQuery({ ...dayQuery(december(14)), retry: 1, retryDelay: 0 })
    }, {})

    await settle()
    let failRead: (error: Error) => void = () => undefined
    vi.mocked(getDay).mockImplementation(
      () =>
        new Promise((_answer, fail) => {
          failRead = fail
        }),
    )
    // Focus refetches the shown Day, and the loader joins that read.
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    const loading = loadQuery(app.queryClient, dayQuery(december(14)))

    loseConnection()
    failRead(new TypeError('Failed to fetch'))

    assert.strictEqual((await loading)?.day.note, 'Onsen at 18:00.')
    await app.close()
  })

  it('answers offline with a Day the snapshot stored, though it was never opened', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp()
    answerDayOffline()

    const page = await loadQuery(app.queryClient, dayQuery(december(14)))

    assert.strictEqual(page?.day.note, 'Onsen at 18:00.')
    await app.close()
  })

  it('answers with the stored Day while the browser is offline, without waiting for the network', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp()
    onlineManager.setOnline(false)

    const page = await loadQuery(app.queryClient, dayQuery(december(14)))

    assert.strictEqual(page?.day.note, 'Onsen at 18:00.')
    await app.close()
  })

  it('fails offline for a Day with nothing stored', async () => {
    answerDayOffline()

    assert.strictEqual(
      await outcomeOf(loadQuery(testQueryClient(), dayQuery(december(14)))),
      'failed',
    )
  })

  it('fails at once while the browser is offline, for a Day with nothing stored', async () => {
    onlineManager.setOnline(false)

    assert.strictEqual(
      await outcomeOf(loadQuery(testQueryClient(), dayQuery(december(14)))),
      'failed',
    )
  })

  it('answers online with the Day as the server reads it now, not the stored one', async () => {
    answerSnapshot(snapshotWith('Onsen at 18:00.'))
    const app = await openApp()
    vi.mocked(getDay).mockImplementation(async () =>
      dayPage(december(14), 'Written on another device.'),
    )

    const page = await loadQuery(app.queryClient, dayQuery(december(14)))

    assert.strictEqual(page?.day.note, 'Written on another device.')
    await app.close()
  })
})
