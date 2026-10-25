// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, assert, describe, it } from '@effect/vitest'
import { hashKey, onlineManager } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { connected, reportConnection } from '@/access/connection-status'
import { keepCacheOnDevice } from '@/trip/client/device-cache'
import { deferred } from '@/trip/client/editor-testing'
import {
  loseConnection,
  outcomeOf,
  serverOutOfReach,
  testQueryClient,
} from '@/trip/client/hook-testing'
import {
  answerHome,
  clockAt,
  closeHome,
  homeDuringTrip,
  openDayNote,
  openHome,
  openHomeFromCold,
  openRoot,
  saveDayNote,
  settle,
  snapshot,
  timePassesTo,
  tokyoTime,
} from '@/trip/client/home-testing'
import { homeQuery, loadQuery } from '@/trip/client/queries'
import { answerSnapshot, dayPage } from '@/trip/client/snapshot-testing'
import { december, HomeState } from '@/trip/domain/domain'
import { getHome } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getHome: vi.fn(),
  getSchedules: vi.fn(),
  getScheduleSnapshot: vi.fn(),
  writeDayNote: vi.fn(),
}))

afterEach(closeHome)

describe('Home after a save away from it', () => {
  it("holds the saved Day note once the connection returns, though Home's read after the save failed", async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()

    // The signal drops right after the save, before Home's read answers.
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    answerHome(withNote)
    await act(async () => reportConnection(connected))
    await settle()
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown()?.home, withNote)
    await app.close()
    await dayNote.close()
  })

  it('opens Home online while a save lands during its read, then holds the saved Day note', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote

    // Phillip opens Home for the first time this session, and his Day note
    // save lands during its read, which started before the save.
    const beforeSave = deferred<HomeState>()
    vi.mocked(getHome).mockImplementation(() => beforeSave.promise)
    const opening = outcomeOf(loadQuery(queryClient, homeQuery))

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    vi.mocked(getHome).mockResolvedValue(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await act(async () =>
      beforeSave.resolve(homeDuringTrip('2026-12-14T20:00:00')),
    )
    await settle()
    const opened = await opening
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(
      { opened, home: app.shown()?.home },
      { opened: 'answered', home: withNote },
    )
    await app.close()
    await dayNote.close()
  })

  it('holds the saved Day note though the device clock went back during a read of Home', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    await (await openHome(queryClient)).close()

    const beforeSave = deferred<HomeState>()
    vi.mocked(getHome).mockImplementation(() => beforeSave.promise)
    const opening = loadQuery(queryClient, homeQuery)
    vi.setSystemTime(tokyoTime('2026-12-14T19:50:00'))

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:00:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    vi.mocked(getHome).mockResolvedValue(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    await act(async () =>
      beforeSave.resolve(homeDuringTrip('2026-12-14T20:00:00')),
    )
    await settle()
    await opening
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown()?.home, withNote)
    await app.close()
    await dayNote.close()
  })

  it('opens offline with a Day note saved after a restart straight onto another page', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    await (await openHomeFromCold()).close()

    // The app restarts on December 14's page, so Home is only what the
    // device kept, and Phillip saves its Day note there.
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const kept = keepCacheOnDevice(queryClient)
    await act(() => kept.saved())
    await timePassesTo('2026-12-14T20:30:00')

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:30:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    answerHome(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown(), {
      home: withNote,
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
    await dayNote.close()
  })

  it('opens offline with a Day note saved on another page while Home was closed', async () => {
    clockAt('2026-12-14T20:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T20:00:00'))
    const dayNote = await openDayNote()
    const { queryClient } = dayNote
    const root = await openRoot(queryClient)
    await (await openHome(queryClient)).close()

    // Phillip saves December 14's Day note on its own page.
    await timePassesTo('2026-12-14T20:30:00')

    const withNote = HomeState.cases.DuringTrip.make({
      ...homeDuringTrip('2026-12-14T20:30:00'),
      today: dayPage(december(14), 'Tsukiji at dawn.'),
    })

    answerHome(withNote)
    await saveDayNote(dayNote, 'Tsukiji at dawn.')
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    const app = await openHome(queryClient)

    assert.deepStrictEqual(app.shown(), {
      home: withNote,
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
    await root.close()
    await dayNote.close()
  })
})

describe('Home after it moved on offline', () => {
  it('shows Home as the server reads it again once the connection returns', async () => {
    clockAt('2026-12-14T21:00:00')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-14T21:00:00'))
    const app = await openHome(testQueryClient())
    loseConnection()
    vi.mocked(getHome).mockImplementation(serverOutOfReach)
    await timePassesTo('2026-12-15T07:00:00')

    answerHome(homeDuringTrip('2026-12-15T07:05:00'))
    await act(async () => {
      onlineManager.setOnline(true)
      reportConnection(connected)
    })
    await timePassesTo('2026-12-15T07:05:00')

    assert.deepStrictEqual(app.shown(), {
      home: homeDuringTrip('2026-12-15T07:05:00'),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })

  it('never moves back to the day before when the device clock runs behind the server', async () => {
    clockAt('2026-12-14T23:59:30')
    answerSnapshot(snapshot)
    answerHome(homeDuringTrip('2026-12-15T00:00:10'))
    const app = await openHome(testQueryClient())

    assert.deepStrictEqual(app.shown(), {
      home: homeDuringTrip('2026-12-15T00:00:10'),
      from: hashKey(homeQuery.queryKey),
    })
    await app.close()
  })
})
