// @vitest-environment happy-dom
import { afterEach, assert, describe, it } from '@effect/vitest'
import { onlineManager } from '@tanstack/react-query'
import { IDBFactory } from 'fake-indexeddb'
import { vi } from 'vite-plus/test'

import { dayPage } from '@/trip/client/snapshot-testing'
import { december } from '@/trip/domain/domain'

// Every fresh page gets this same mock, so each page reads December 14 here.
const { getDay } = vi.hoisted(() => ({ getDay: vi.fn() }))

vi.mock('@/trip/trip/trip.functions', () => ({
  getDay,
  getScheduleSnapshot: vi.fn(),
}))

/** The one part of the browser's IndexedDB the app calls, `open`. */
interface BrowserIndexedDB {
  readonly open: (name: string) => object
}

/**
 * Opens the app on a fresh page, as a reload does, on a browser whose
 * IndexedDB is `storage`, and loads December 14 as its page does. With
 * `outOfReach`, the page's reads never reach the server.
 */
const openDay = async (storage: BrowserIndexedDB, outOfReach = false) => {
  vi.stubGlobal('indexedDB', storage)
  vi.resetModules()
  const { keepCacheOnDevice } = await import('@/trip/client/device-cache')

  const { serverOutOfReach, testQueryClient } =
    await import('@/trip/client/hook-testing')

  const { dayQuery, loadQuery } = await import('@/trip/client/queries')

  if (outOfReach) getDay.mockImplementation(serverOutOfReach)
  const queryClient = testQueryClient()
  const kept = keepCacheOnDevice(queryClient)

  const loadDay = () => loadQuery(queryClient, dayQuery(december(14)))

  return { page: loadDay(), loadDay, saved: kept.saved }
}

/**
 * IndexedDB from `storage` on a full disk, which refuses every write until
 * `free` makes room.
 */
const fullDisk = (storage: IDBFactory) => {
  let full = true

  // The part of a database the storage module uses.
  const refusingWrites = (database: IDBDatabase) => ({
    transaction: (name: string, mode: IDBTransactionMode) => {
      if (full && mode === 'readwrite') {
        throw new DOMException('The disk is full', 'QuotaExceededError')
      }

      return database.transaction(name, mode)
    },
    createObjectStore: (name: string) => database.createObjectStore(name),
    set onclose(listener: Listener) {
      database.onclose = listener
    },
  })

  return {
    open: (name: string) => {
      const request = storage.open(name)

      return {
        get result() {
          return refusingWrites(request.result)
        },
        get error() {
          return request.error
        },
        set onupgradeneeded(listener: Listener) {
          request.onupgradeneeded = listener
        },
        set onsuccess(listener: Listener) {
          request.onsuccess = listener
        },
        set onerror(listener: Listener) {
          request.onerror = listener
        },
        set oncomplete(_listener: Listener) {},
        set onabort(_listener: Listener) {},
      }
    },
    free: () => {
      full = false
    },
  }
}

type Listener = ((event: Event) => void) | null

/** IndexedDB from `storage` whose database opens `ms` late. */
const openingLate = (storage: IDBFactory, ms: number) => ({
  open: (name: string) => {
    const request = storage.open(name)

    return {
      get result() {
        return request.result
      },
      get error() {
        return request.error
      },
      set onupgradeneeded(listener: Listener) {
        request.onupgradeneeded = listener
      },
      set onsuccess(listener: Listener) {
        request.onsuccess = (event) => {
          setTimeout(() => listener?.(event), ms)
        }
      },
      set onerror(listener: Listener) {
        request.onerror = listener
      },
      set oncomplete(_listener: Listener) {},
      set onabort(_listener: Listener) {},
    }
  },
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  onlineManager.setOnline(true)
  getDay.mockReset()
})

describe('the app on a device whose IndexedDB fails or is slow', () => {
  it('opens a Day online when the browser refuses IndexedDB', async () => {
    getDay.mockResolvedValue(dayPage(december(14), 'Onsen at 18:00.'))

    const { page } = await openDay({
      open: () => {
        throw new DOMException('Storage disabled', 'SecurityError')
      },
    })

    assert.strictEqual((await page)?.day.note, 'Onsen at 18:00.')
  })

  it('opens a Day online when IndexedDB never answers', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    getDay.mockResolvedValue(dayPage(december(14), 'Onsen at 18:00.'))

    // An open request that never succeeds or fails, as when another tab
    // blocks the database.
    const { page } = await openDay({ open: () => ({}) })
    await vi.advanceTimersByTimeAsync(10_000)

    assert.strictEqual((await page)?.day.note, 'Onsen at 18:00.')
  })

  it('opens a kept Day offline when IndexedDB answers later than an online page waits', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    const storage = new IDBFactory()
    getDay.mockResolvedValue(dayPage(december(14), 'Onsen at 18:00.'))
    const online = await openDay(storage)
    await online.page
    await online.saved()

    onlineManager.setOnline(false)
    const { page } = await openDay(openingLate(storage, 3500))
    await vi.advanceTimersByTimeAsync(4000)

    assert.strictEqual((await page)?.day.note, 'Onsen at 18:00.')
  })

  it('opens a kept Day from cold offline when IndexedDB answers late, though the app learns it is offline only when its read fails', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    })
    const storage = new IDBFactory()
    getDay.mockResolvedValue(dayPage(december(14), 'Onsen at 18:00.'))
    const online = await openDay(storage)
    await online.page
    await online.saved()

    const { page } = await openDay(openingLate(storage, 3500), true)
    await vi.advanceTimersByTimeAsync(4000)

    assert.strictEqual((await page)?.day.note, 'Onsen at 18:00.')
  })

  it('keeps a Day once the disk has room again, though reading it again finds it unchanged', async () => {
    const storage = new IDBFactory()
    const disk = fullDisk(storage)
    getDay.mockResolvedValue(dayPage(december(14), 'Onsen at 18:00.'))
    const online = await openDay(disk)
    await online.page
    await online.saved()

    disk.free()
    await online.loadDay()
    await online.saved()
    onlineManager.setOnline(false)
    const { page } = await openDay(storage)

    assert.strictEqual((await page)?.day.note, 'Onsen at 18:00.')
  })
})
