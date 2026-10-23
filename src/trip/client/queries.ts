import {
  hashKey,
  onlineManager,
  partialMatchKey,
  queryOptions,
  useQuery,
} from '@tanstack/react-query'
import type {
  FetchQueryOptions,
  Query,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'
import { deviceCacheRestoring } from '@/trip/client/device-cache'
import { readUntilAnswered } from '@/trip/client/owed-reads'
import {
  answeredSince,
  answerOfRead,
  readAwaited,
  startRead,
} from '@/trip/client/read-order'
import type { Read } from '@/trip/client/read-order'
import {
  checklistQuery,
  dayQuery,
  homeQuery,
  keys,
  schedulesQuery,
  subscribeToQuery,
} from '@/trip/client/queries.reads'
import {
  getHome,
  getScheduleSnapshot,
  getScheduleSummary,
} from '@/trip/trip/trip.functions'

export { useHome } from '@/trip/client/queries.home'

export {
  checklistQuery,
  dayQuery,
  homeQuery,
  scheduleByIdQuery,
  scheduleMapQuery,
  schedulesQuery,
  subscribeToQuery,
} from '@/trip/client/queries.reads'

// A page shown again must not open on data another device has since changed,
// and only shown queries refetch on focus and reconnect. So loaders read
// these with `loadQuery`, which waits for fresh data whenever the cache is
// stale, and set `staleReloadMode: 'blocking'`, so the router waits for that
// too instead of rendering its cached match first. The page then mounts on
// what its loader just read, so mounting never fetches again.

const isOffline = () =>
  !onlineManager.isOnline() ||
  ConnectionStatus.$is('Offline')(currentConnection())

/**
 * Resolves with the data stored for `queryKey` as soon as the app is offline
 * and has data stored for it, or once it holds data from read number `read`
 * or a later one, which may already be the case. The two can happen in either
 * order, such as a snapshot storing a Day after the connection dropped.
 * `stop` removes the listeners.
 */
const storedOnceCurrent = <TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: number,
) => {
  let stop = () => {}

  const answer = new Promise<TData>((resolve) => {
    const answerIfCurrent = () => {
      const data = queryClient.getQueryData<TData>(queryKey)

      if (data !== undefined && (isOffline() || answeredSince(data, read))) {
        resolve(data)
      }
    }

    answerIfCurrent()

    const stopOnline = onlineManager.subscribe(answerIfCurrent)
    const stopConnection = subscribeToConnection(answerIfCurrent)

    const stopStoring = subscribeToQuery(
      queryClient,
      hashKey(queryKey),
      answerIfCurrent,
    )

    stop = () => {
      stopOnline()
      stopConnection()
      stopStoring()
    }
  })

  return { answer, stop }
}

/**
 * Reads a query for a loader. Online, it fetches fresh data, as
 * `fetchQuery` does with a zero stale time, and answers with what the app
 * then stores, or sooner with what a later read stores, such as a save's own
 * read. Offline, it answers at once with the data the app already
 * has instead of waiting for the network. That includes going offline in
 * the middle of the read. With nothing stored, it fails. It fails at once
 * when the browser knows it is offline, where `fetchQuery` would wait for
 * the network, and otherwise fails as the read does. It first waits for
 * the data the device kept, so a page opened from cold offline has it, and
 * waits longer when the read finds the app offline.
 */
export const loadQuery = async <TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<TData, Error, TData, TKey>,
): Promise<TData> => {
  // Waits only while a restore runs, so a read starts in the same tick as
  // before once the app holds what the device kept.
  const restoring = deviceCacheRestoring(queryClient, isOffline())

  if (restoring !== undefined) await restoring

  const stored = () => queryClient.getQueryData<TData>(options.queryKey)
  const before = stored()

  if (before !== undefined && isOffline()) return before

  if (!onlineManager.isOnline()) {
    throw new Error('Offline, with nothing stored for this page')
  }

  // A save's own read, or any read started after the one this loader waits
  // on, may store first. The loader then answers with that.
  const current = storedOnceCurrent<TData>(
    queryClient,
    options.queryKey,
    readAwaited(
      options.queryKey,
      queryClient.getQueryState(options.queryKey)?.fetchStatus !== 'idle',
    ),
  )

  try {
    return await Promise.race([
      queryClient.fetchQuery(options).then((fetched) => stored() ?? fetched),
      current.answer,
    ])
  } catch (error) {
    // A cold start can learn it is offline only here, while the restore
    // still runs.
    const stillRestoring = isOffline()
      ? deviceCacheRestoring(queryClient, true)
      : undefined

    if (stillRestoring !== undefined) await stillRestoring

    const after = stored()

    if (after !== undefined && isOffline()) return after
    throw error
  } finally {
    current.stop()
  }
}

/**
 * Stores `data`, which `read` answered, in the query of `options`, unless an
 * answer from a later read is stored there. It builds the query with its own
 * options first, so one never read on its own still checks the read numbers.
 */
const storeRead = <T, K extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, K>,
  data: T,
  read: Read,
) => {
  queryClient.getQueryCache().build(queryClient, options)
  queryClient.setQueryData<T>(options.queryKey, answerOfRead(data, read), {
    updatedAt: read.answeredAt,
  })
}

/**
 * Reads the Schedule snapshot, and stores the Schedules, every Day page and
 * the Checklist from it, skipping any already stored from a later read.
 */
const readSnapshot = async (queryClient: QueryClient) => {
  const started = startRead()
  const snapshot = await getScheduleSnapshot()
  const read = { started, answeredAt: Date.now() }

  if (snapshot === null) return snapshot
  storeRead(queryClient, schedulesQuery, snapshot.schedules, read)

  for (const page of snapshot.days) {
    storeRead(queryClient, dayQuery(page.day.date), page, read)
  }

  storeRead(queryClient, checklistQuery, snapshot.checklist, read)

  return snapshot
}

const scheduleSnapshotQuery = queryOptions({
  queryKey: keys.scheduleSnapshot,
  // The device keeps the Schedules, Days and Checklist the snapshot stores,
  // so keeping the snapshot too would store a second copy.
  meta: { kept: false },
  queryFn: ({ client }) => readSnapshot(client),
})

/**
 * Stores the Schedules, every Day page and the Checklist from the Schedule
 * snapshot, so any Day opens offline, even one never opened on this device.
 * They all come from one snapshot, except any stored from a later read. It reads
 * the snapshot after hydration, on focus and on reconnect, and every write
 * reads it too. It never re-renders its component.
 */
export const useScheduleSnapshot = () => {
  useQuery({ ...scheduleSnapshotQuery, notifyOnChangeProps: [] })
}

const scheduleSummaryQuery = queryOptions({
  queryKey: keys.scheduleSummary,
  queryFn: () => getScheduleSummary(),
})

/**
 * The Schedule summary: undefined until it first answers, then null before a
 * Schedule exists. `useQuery` only fetches in the browser, after hydration.
 *
 * It is undefined in a server render and on the render that hydrates a page,
 * because the server never has it. A code-split page hydrates after the app
 * nav has read the summary, and its first render must still match the
 * server's HTML.
 */
export const useScheduleSummary = () => {
  const hydrated = useHydrated()
  const { data } = useQuery(scheduleSummaryQuery)

  return hydrated ? data : undefined
}

const neverDehydrated: ReadonlyArray<unknown> = [
  keys.scheduleSummary[0],
  keys.scheduleSnapshot[0],
]

/**
 * Whether a server render may carry a query into the page. Never the Schedule
 * summary, even if a loader fetched it, so prerendered HTML can't contain it,
 * and never the Schedule snapshot, which only the browser reads.
 */
export const shouldDehydrateQuery = (query: Query) =>
  !neverDehydrated.includes(query.queryKey[0])

const replacingTheSchedule = [
  keys.schedules,
  keys.days,
  keys.home,
  keys.scheduleSummary,
  keys.scheduleById,
  keys.checklist,
  keys.scheduleMap,
] as const

const withTheSchedule = [keys.home, keys.schedules, keys.scheduleById] as const

const withTheScheduleAndDays = [keys.days, ...withTheSchedule] as const

const withTheScheduleDaysAndMap = [
  ...withTheScheduleAndDays,
  keys.scheduleMap,
] as const

const affectedBy = {
  choose: replacingTheSchedule,
  restore: replacingTheSchedule,
  dayNote: withTheScheduleAndDays,
  activity: withTheScheduleDaysAndMap,
  stayNote: withTheSchedule,
  hotelDetails: withTheScheduleDaysAndMap,
  stayEdit: [...withTheScheduleDaysAndMap, keys.checklist],
  pin: withTheScheduleDaysAndMap,
  tripNote: [keys.schedules],
  checklist: [keys.checklist],
} as const satisfies Record<string, ReadonlyArray<QueryKey>>

export type TripWrite = keyof typeof affectedBy

/**
 * Reads the Schedule snapshot after a write while the app keeps it. With
 * nothing keeping it, the write owes no read, since the root reads the
 * snapshot when it mounts.
 */
const readKeptSnapshot = async (queryClient: QueryClient) => {
  const kept = queryClient
    .getQueryCache()
    .find({ queryKey: keys.scheduleSnapshot, exact: true })
    ?.isActive()

  if (kept === true) await readSnapshot(queryClient)
}

/**
 * Invalidates the queries given. It also reads the Schedule snapshot again,
 * without waiting for it, and Home when it's among them, waiting only while
 * Home is shown. Each goes again once the connection returns, until it
 * answers.
 */
const invalidate = (
  queryClient: QueryClient,
  queryKeys: ReadonlyArray<QueryKey>,
) => {
  void readUntilAnswered(queryClient, readKeptSnapshot)

  const refetched = queryKeys.flatMap((queryKey) =>
    queryKey === keys.home ? [] : [queryClient.invalidateQueries({ queryKey })],
  )

  // Home isn't in the snapshot, and offline it opens as last read, so a save
  // must reach the Home the device keeps, shown or not. It has its own read
  // in place of the refetch the invalidation would start.
  if (queryKeys.includes(keys.home)) {
    const shown = queryClient
      .getQueryCache()
      .find({ queryKey: keys.home, exact: true })
      ?.isActive()

    void queryClient.invalidateQueries({
      queryKey: keys.home,
      refetchType: 'none',
    })
    const reading = readUntilAnswered(queryClient, readHome)

    if (shown === true) refetched.push(reading)
  }

  return Promise.all(refetched)
}

/**
 * Reads Home and stores it in read order, while the app holds Home, shown or
 * not. A read of Home under way, such as a page loader's, may predate the
 * write, but the read order keeps it from replacing this one.
 */
const readHome = async (queryClient: QueryClient) => {
  const held = queryClient
    .getQueryCache()
    .find({ queryKey: keys.home, exact: true })

  if (held === undefined) return

  const started = startRead()
  const home = await getHome()
  storeRead(queryClient, homeQuery, home, { started, answeredAt: Date.now() })
}

/**
 * Invalidates exactly the queries a successful write affects, and resolves
 * once the shown ones have refetched. The rest refetch when next shown.
 * Meanwhile it reads the Schedule snapshot again, which stores them, and
 * reads Home, waiting for Home only while it's shown. A read that fails goes
 * again once a request gets an answer, until it answers.
 */
export const invalidateAfter = (queryClient: QueryClient, write: TripWrite) =>
  invalidate(queryClient, affectedBy[write])

/**
 * Calls back whenever a shown query a write affects is read successfully;
 * returns how to stop. Only shown ones count, the ones whose data is on
 * screen, never one preloaded for a page not yet open.
 */
export const subscribeToReadsAfter = (
  queryClient: QueryClient,
  write: TripWrite,
  listener: () => void,
) =>
  queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === 'updated' &&
      event.action.type === 'success' &&
      event.query.isActive() &&
      affectedBy[write].some((queryKey) =>
        partialMatchKey(event.query.queryKey, queryKey),
      )
    ) {
      listener()
    }
  })

export const invalidateAfterScheduleChanged = (queryClient: QueryClient) =>
  invalidate(queryClient, replacingTheSchedule)
