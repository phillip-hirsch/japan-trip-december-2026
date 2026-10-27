// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { focusManager, QueryClient } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { connected, reportConnection } from '@/access/connection-status'
import {
  comeBackOnline,
  deferred,
  goOffline,
} from '@/trip/client/editor-testing'
import {
  loseConnection,
  outOfReachAsAnotherRequestAnswers,
  serverOutOfReach,
  withClient,
} from '@/trip/client/hook-testing'
import {
  answerHome,
  clockAt,
  closeHome,
  homeDuringTrip,
  openDayNote,
  openHome,
  openRoot,
  saveDayNote,
  settle,
  snapshot,
  timePassesTo,
  tokyoTime,
} from '@/trip/client/home-testing'
import { useLastUpdated } from '@/trip/client/last-updated'
import { queryDefaults } from '@/trip/client/query-client'
import type { ScreenQuery } from '@/trip/client/last-updated'
import {
  checklistQuery,
  dayQuery,
  homeQuery,
  loadQuery,
  schedulesQuery,
} from '@/trip/client/queries'
import {
  answerSnapshot,
  dayPage,
  snapshotWith,
} from '@/trip/client/snapshot-testing'
import { tripDates } from '@/trip/domain/calendar'
import { december, HomeState } from '@/trip/domain/domain'
import type { ScheduleSnapshot } from '@/trip/domain/domain'
import {
  getDay,
  getHome,
  getSchedules,
  getScheduleSnapshot,
} from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getChecklist: vi.fn(),
  getDay: vi.fn(),
  getHome: vi.fn(),
  getSchedules: vi.fn(),
  getScheduleSnapshot: vi.fn(),
  writeDayNote: vi.fn(),
}))

afterEach(async () => {
  focusManager.setFocused(undefined)
  await closeHome()
  vi.mocked(getScheduleSnapshot).mockReset()
})

/** The snapshot once Phillip's Day note on December 14 is saved. */
const saved = snapshotWith('Tsukiji at dawn.')

/** Home at 20:30 on December 14, once the Day note is saved. */
const homeWithNote = HomeState.cases.DuringTrip.make({
  ...homeDuringTrip('2026-12-14T20:30:00'),
  today: dayPage(december(14), 'Tsukiji at dawn.'),
})

/**
 * When each screen showing one of `queries` says it was last updated, to the
 * minute, as an ISO instant.
 */
const lastUpdated = async (
  queryClient: QueryClient,
  queries: ReadonlyArray<ScreenQuery>,
) => {
  const shown: Array<string | undefined> = []

  const Screen = ({ query, at }: { query: ScreenQuery; at: number }) => {
    shown[at] = useLastUpdated(query)?.dateTime.slice(0, 16)

    return null
  }

  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(
      withClient(
        queryClient,
        ...queries.map((query, at) =>
          createElement(Screen, { key: at, query, at }),
        ),
      ),
    ),
  )
  await act(async () => root.unmount())

  return shown
}

/** 20:00 on December 14, to the minute, as `lastUpdated` gives it. */
const atEight = tokyoTime('2026-12-14T20:00:00').toISOString().slice(0, 16)

/** 20:30 on December 14, to the minute, as `lastUpdated` gives it. */
const atHalfPast = tokyoTime('2026-12-14T20:30:00').toISOString().slice(0, 16)

/**
 * What the Schedule page, every Day page and the Checklist open with offline,
 * and when each says it was last updated.
 */
const openedOffline = async (queryClient: QueryClient) => {
  loseConnection()
  vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)
  vi.mocked(getSchedules).mockImplementation(serverOutOfReach)
  vi.mocked(getDay).mockImplementation(serverOutOfReach)
  const days = tripDates.map(dayQuery)

  return {
    schedules: await loadQuery(queryClient, schedulesQuery),
    days: await Promise.all(days.map((day) => loadQuery(queryClient, day))),
    checklist: await loadQuery(queryClient, checklistQuery),
    updated: await lastUpdated(queryClient, [
      schedulesQuery,
      ...days,
      checklistQuery,
    ]),
  }
}

describe('the screens a save affects', () => {
  it('hold the save offline once a request answers again, though the snapshot read after the save failed', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)

    // The connection drops right after the save, before the snapshot answers.
    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await timePassesTo('2026-12-14T20:30:00')
    answerSnapshot(saved)
    await comeBackOnline()
    await settle()

    assert.deepStrictEqual(await openedOffline(queryClient), {
      schedules: saved.schedules,
      days: [...saved.days],
      checklist: saved.checklist,
      updated: tripDates.map(() => atHalfPast).concat(atHalfPast, atHalfPast),
    })
    await root.close()
    await dayNote.close()
  })

  it('hold the save offline though a request got an answer before the failed snapshot read settled', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)
    await timePassesTo('2026-12-14T20:30:00')

    answerSnapshot(saved)
    vi.mocked(getSchedules).mockResolvedValue(saved.schedules)
    vi.mocked(getScheduleSnapshot).mockImplementationOnce(
      outOfReachAsAnotherRequestAnswers,
    )
    await saveDayNote(dayNote, 'Tsukiji at dawn.')

    assert.deepStrictEqual(await openedOffline(queryClient), {
      schedules: saved.schedules,
      days: [...saved.days],
      checklist: saved.checklist,
      updated: tripDates.map(() => atHalfPast).concat(atHalfPast, atHalfPast),
    })
    await root.close()
    await dayNote.close()
  })

  it('hold the save offline though a request got an answer while the failed snapshot read waited to try again', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    // The app's own client tries a failed read again after a pause.
    queryClient.setDefaultOptions({ queries: queryDefaults })
    const root = await openRoot(queryClient)
    await timePassesTo('2026-12-14T20:30:00')

    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    answerSnapshot(saved)
    await comeBackOnline()
    await settle()

    // The connection drops again before any pause between tries ends.
    const offline = await openedOffline(queryClient)
    await timePassesTo('2026-12-14T20:31:00')

    assert.deepStrictEqual(offline, {
      schedules: saved.schedules,
      days: [...saved.days],
      checklist: saved.checklist,
      updated: tripDates.map(() => atHalfPast).concat(atHalfPast, atHalfPast),
    })
    await root.close()
    await dayNote.close()
  })

  it("hold the save offline though the snapshot's read after the save hung while the connection dropped and returned", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)
    await timePassesTo('2026-12-14T20:30:00')

    // The snapshot's read after the save never gets an answer, and the
    // connection drops and returns while it waits.
    vi.mocked(getScheduleSnapshot).mockImplementationOnce(
      () => new Promise(() => {}),
    )
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    answerSnapshot(saved)
    await goOffline()
    await comeBackOnline()
    await settle()

    assert.deepStrictEqual(await openedOffline(queryClient), {
      schedules: saved.schedules,
      days: [...saved.days],
      checklist: saved.checklist,
      updated: tripDates.map(() => atHalfPast).concat(atHalfPast, atHalfPast),
    })
    await root.close()
    await dayNote.close()
  })

  it("hold the save offline when the snapshot's read after the save is the request that brings the connection back", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)
    await timePassesTo('2026-12-14T20:30:00')

    // The snapshot's read after the save waits through a drop, and its own
    // answer is the one that brings the connection back.
    const answer = deferred<ScheduleSnapshot>()
    vi.mocked(getSchedules).mockResolvedValue(saved.schedules)
    vi.mocked(getScheduleSnapshot).mockImplementationOnce(async () => {
      const answered = await answer.promise
      reportConnection(connected)

      return answered
    })
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await goOffline()
    vi.mocked(getScheduleSnapshot).mockImplementation(serverOutOfReach)
    await act(async () => answer.resolve(saved))
    await settle()

    assert.deepStrictEqual(await openedOffline(queryClient), {
      schedules: saved.schedules,
      days: [...saved.days],
      checklist: saved.checklist,
      updated: tripDates.map(() => atHalfPast).concat(atHalfPast, atHalfPast),
    })
    await root.close()
    await dayNote.close()
  })

  it('keep their state from before the save, rather than read again and again, when the server refuses the read after it', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)

    // The server refuses the first read after the save and would answer any
    // later one with the save, so a read that repeats would store it.
    answerSnapshot(saved)
    vi.mocked(getScheduleSnapshot).mockRejectedValueOnce(
      new Error('Internal Server Error'),
    )
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await timePassesTo('2026-12-14T20:30:00')

    assert.deepStrictEqual(await openedOffline(queryClient), {
      schedules: snapshot.schedules,
      days: [...snapshot.days],
      checklist: snapshot.checklist,
      updated: tripDates.map(() => atEight).concat(atEight, atEight),
    })
    await root.close()
    await dayNote.close()
  })
})

describe('the Schedule snapshot', () => {
  it('stores every Day to open offline though its first read met a server error', async () => {
    clockAt('2026-12-14T20:00:00')

    // This is the app's own client, which tries a failed read again after a
    // pause.
    const queryClient = new QueryClient({
      defaultOptions: { queries: queryDefaults },
    })

    vi.mocked(getScheduleSnapshot)
      .mockRejectedValueOnce(new Error('Internal Server Error'))
      .mockResolvedValue(snapshot)
    const root = await openRoot(queryClient)
    await timePassesTo('2026-12-14T20:00:05')
    loseConnection()
    vi.mocked(getDay).mockImplementation(serverOutOfReach)

    assert.deepStrictEqual(
      await Promise.all(
        tripDates.map((date) => loadQuery(queryClient, dayQuery(date))),
      ),
      [...snapshot.days],
    )
    await root.close()
  })
})

describe('Home after a save', () => {
  it('holds the save offline once the connection returns, though it was shown during the save and its read failed', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const home = await openHome(queryClient)
    await timePassesTo('2026-12-14T20:30:00')

    // Phillip saves Today's Day note on Home, and the connection drops at once.
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await home.close()
    answerHome(homeWithNote)
    await comeBackOnline()
    await settle()
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      {
        home: app.shown()?.home,
        updated: await lastUpdated(queryClient, [homeQuery]),
      },
      { home: homeWithNote, updated: [atHalfPast] },
    )
    await app.close()
    await dayNote.close()
  })

  it('holds the save offline though its read after the save hung while the connection dropped and returned', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()
    await timePassesTo('2026-12-14T20:30:00')

    // Home's read after the save never gets an answer, and the connection
    // drops and returns while it waits.
    answerHome(homeWithNote)
    vi.mocked(getHome).mockImplementationOnce(() => new Promise(() => {}))
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await goOffline()
    await comeBackOnline()
    await settle()
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      {
        home: app.shown()?.home,
        updated: await lastUpdated(queryClient, [homeQuery]),
      },
      { home: homeWithNote, updated: [atHalfPast] },
    )
    await app.close()
    await dayNote.close()
  })

  it("opens online with the save though its page's read from before the save never answers", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await timePassesTo('2026-12-14T20:30:00')

    // Home's page starts loading before the save, and its read never answers.
    vi.mocked(getHome).mockImplementationOnce(() => new Promise(() => {}))
    const preloading = loadQuery(queryClient, homeQuery)
    answerHome(homeWithNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    // Phillip then opens Home, and its loader runs again.
    const opening = loadQuery(queryClient, homeQuery)

    assert.deepStrictEqual(
      { preloaded: await preloading, opened: await opening },
      { preloaded: homeWithNote, opened: homeWithNote },
    )
    await dayNote.close()
  })

  it('opens online with the save though a read of it from before the save waits to try again', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    // The app's own client tries a failed read again after a pause.
    queryClient.setDefaultOptions({ queries: queryDefaults })
    const home = await openHome(queryClient)
    await timePassesTo('2026-12-14T20:30:00')

    // Home reads again as the app comes back into focus, meets a server
    // error and waits to try again, and its next try never answers.
    vi.mocked(getHome).mockRejectedValueOnce(new Error('Internal Server Error'))
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    answerHome(homeWithNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    vi.mocked(getHome).mockImplementation(() => new Promise(() => {}))

    assert.deepStrictEqual(
      await loadQuery(queryClient, homeQuery),
      homeWithNote,
    )
    await home.close()
    await dayNote.close()
  })

  it('holds the save offline though its first read, from before the save, never answers', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await timePassesTo('2026-12-14T20:30:00')

    // Home's page starts loading before the save, and its read never answers.
    vi.mocked(getHome).mockImplementationOnce(() => new Promise(() => {}))
    void loadQuery(queryClient, homeQuery)
    answerHome(homeWithNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      {
        home: app.shown()?.home,
        updated: await lastUpdated(queryClient, [homeQuery]),
      },
      { home: homeWithNote, updated: [atHalfPast] },
    )
    await app.close()
    await dayNote.close()
  })

  it('holds the save offline though a request got an answer before its failed read settled', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()
    await timePassesTo('2026-12-14T20:30:00')

    answerHome(homeWithNote)
    vi.mocked(getHome).mockImplementationOnce(outOfReachAsAnotherRequestAnswers)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      {
        home: app.shown()?.home,
        updated: await lastUpdated(queryClient, [homeQuery]),
      },
      { home: homeWithNote, updated: [atHalfPast] },
    )
    await app.close()
    await dayNote.close()
  })

  it('keeps its state from before the save, rather than read again and again, when the server refuses the read after it', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()

    // The server refuses the first read after the save and would answer any
    // later one with the save, so a read that repeats would store it.
    answerHome(homeWithNote)
    vi.mocked(getHome).mockRejectedValueOnce(new Error('Internal Server Error'))
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await timePassesTo('2026-12-14T20:30:00')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      {
        home: app.shown()?.home,
        updated: await lastUpdated(queryClient, [homeQuery]),
      },
      { home: homeDuringTrip('2026-12-14T20:00:00'), updated: [atEight] },
    )
    await app.close()
    await dayNote.close()
  })
})
