import {
  hashKey,
  onlineManager,
  partialMatchKey,
  queryOptions,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type {
  FetchQueryOptions,
  Query,
  QueryClient,
  QueryFunctionContext,
  QueryKey,
} from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'
import { useEffect } from 'react'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import { millisecondsUntilTokyoMidnight } from '@/trip/domain/calendar'
import type { IsoDate } from '@/trip/domain/domain'
import {
  getChecklist,
  getDay,
  getHome,
  getScheduleById,
  getScheduleMap,
  getSchedules,
  getScheduleSnapshot,
  getScheduleSummary,
} from '@/trip/trip/trip.functions'

/**
 * One key per query, none a prefix of another, so invalidating one never
 * reaches the rest.
 */
const keys = {
  home: ['home'],
  schedules: ['schedules'],
  days: ['days'],
  scheduleSummary: ['schedule-summary'],
  scheduleById: ['schedule-by-id'],
  checklist: ['checklist'],
  scheduleMap: ['schedule-map'],
  scheduleSnapshot: ['schedule-snapshot'],
} as const satisfies Record<string, QueryKey>

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
 * Reads a query for a loader. Online, it fetches fresh data, as
 * `fetchQuery` does with a zero stale time. Offline, it answers at once with
 * the data the app already has instead of waiting for the network. With
 * nothing stored, it fails: at once when the browser knows it is offline,
 * where `fetchQuery` would wait for the network, otherwise as the read does.
 */
export const loadQuery = async <TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<TData, Error, TData, TKey>,
): Promise<TData> => {
  const stored = () => queryClient.getQueryData<TData>(options.queryKey)
  const before = stored()

  if (before !== undefined && isOffline()) return before

  if (!onlineManager.isOnline()) {
    throw new Error('Offline, with nothing stored for this page')
  }

  try {
    return await queryClient.fetchQuery(options)
  } catch (error) {
    const after = stored()

    if (after !== undefined && isOffline()) return after
    throw error
  }
}

/**
 * The order each stored answer's read started in, by query. An answer never
 * replaces one whose read started later, whichever arrives last, so a slow
 * read can't roll back a newer one. Reads of the Schedules, the Days and the
 * Checklist keep to it, and so does every Schedule snapshot that fills them.
 */
const readOrders = new WeakMap<QueryClient, Map<string, number>>()

let readsStarted = 0

const startRead = () => ++readsStarted

/** Records a read's answer as stored for `queryKey`, unless a later one is. */
const isLatestRead = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  started: number,
) => {
  const order = readOrders.get(queryClient) ?? new Map<string, number>()
  readOrders.set(queryClient, order)
  const hash = hashKey(queryKey)

  if ((order.get(hash) ?? 0) > started) return false
  order.set(hash, started)

  return true
}

/** A query function that keeps to the read order. */
const inReadOrder =
  <T>(read: () => Promise<T>) =>
  async ({ client, queryKey }: QueryFunctionContext): Promise<T> => {
    const started = startRead()
    const answer = await read()

    if (isLatestRead(client, queryKey, started)) return answer

    return client.getQueryData<T>(queryKey) ?? answer
  }

export const homeQuery = queryOptions({
  queryKey: keys.home,
  queryFn: () => getHome(),
  refetchOnMount: false,
})

const homeRetryDelay = 60_000

const nextTokyoMidnightDeadline = (readAt: number) =>
  readAt + millisecondsUntilTokyoMidnight(readAt) + 1000

export const useHome = () => {
  const queryClient = useQueryClient()
  const { data, dataUpdatedAt, errorUpdatedAt } = useSuspenseQuery(homeQuery)
  const readAt = Date.parse(data.readAt)
  useEffect(() => {
    const deadline = nextTokyoMidnightDeadline(readAt)
    const overdue = Date.now() >= deadline
    const lastRefetchFailed = errorUpdatedAt > dataUpdatedAt

    const delay =
      overdue && lastRefetchFailed
        ? homeRetryDelay
        : Math.max(deadline - Date.now(), 0)

    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: keys.home }),
      delay,
    )

    return () => clearTimeout(timer)
  }, [queryClient, readAt, dataUpdatedAt, errorUpdatedAt])

  return data
}

export const dayQuery = (date: IsoDate) =>
  queryOptions({
    queryKey: [...keys.days, date],
    queryFn: inReadOrder(() => getDay({ data: { date } })),
    refetchOnMount: false,
  })

export const schedulesQuery = queryOptions({
  queryKey: keys.schedules,
  queryFn: inReadOrder(() => getSchedules()),
  refetchOnMount: false,
})

export const scheduleByIdQuery = (scheduleId: string) =>
  queryOptions({
    queryKey: [...keys.scheduleById, scheduleId],
    queryFn: () => getScheduleById({ data: { scheduleId } }),
    refetchOnMount: false,
  })

export const checklistQuery = queryOptions({
  queryKey: keys.checklist,
  queryFn: inReadOrder(() => getChecklist()),
  refetchOnMount: false,
})

export const scheduleMapQuery = queryOptions({
  queryKey: keys.scheduleMap,
  queryFn: () => getScheduleMap(),
  refetchOnMount: false,
})

/** The snapshot as the server function answers it, still plain data. */
type SnapshotAnswer = Awaited<ReturnType<typeof getScheduleSnapshot>>

/**
 * Stores the Schedules, every Day page and the Checklist from a snapshot
 * whose read started `started`, each unless a later read is stored.
 */
const storeSnapshot = (
  queryClient: QueryClient,
  snapshot: SnapshotAnswer,
  started: number,
) => {
  if (snapshot === null) return

  const isLatest = (queryKey: QueryKey) =>
    isLatestRead(queryClient, queryKey, started)

  if (isLatest(schedulesQuery.queryKey)) {
    queryClient.setQueryData(schedulesQuery.queryKey, snapshot.schedules)
  }

  for (const page of snapshot.days) {
    const { queryKey } = dayQuery(page.day.date)

    if (isLatest(queryKey)) queryClient.setQueryData(queryKey, page)
  }

  if (isLatest(checklistQuery.queryKey)) {
    queryClient.setQueryData(checklistQuery.queryKey, snapshot.checklist)
  }
}

const scheduleSnapshotQuery = queryOptions({
  queryKey: keys.scheduleSnapshot,
  queryFn: async ({ client, signal }) => {
    const started = startRead()
    const snapshot = await getScheduleSnapshot()

    // A read cancelled for a write may predate it, so it stores nothing.
    if (!signal.aborted) storeSnapshot(client, snapshot, started)

    return snapshot
  },
})

/**
 * Stores the Schedules, every Day page and the Checklist from the Schedule
 * snapshot, so any Day opens offline, even one never opened on this device.
 * They come from one snapshot, unless a later read of one is stored. It reads
 * the snapshot after hydration, on focus, on reconnect and after every write.
 * It never re-renders its component.
 */
export const useScheduleSnapshot = () => {
  useQuery({ ...scheduleSnapshotQuery, notifyOnChangeProps: [] })
}

/**
 * Reads the snapshot again while the app keeps it. It first cancels a read
 * already under way, which may predate the write, even when no snapshot has
 * answered yet.
 */
const refreshSnapshot = async (queryClient: QueryClient) => {
  const queryKey = keys.scheduleSnapshot
  await queryClient.cancelQueries({ queryKey })
  await queryClient.invalidateQueries({ queryKey })
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

/** Also reads the Schedule snapshot again, without waiting for it. */
const invalidate = (
  queryClient: QueryClient,
  queryKeys: ReadonlyArray<QueryKey>,
) => {
  void refreshSnapshot(queryClient)

  return Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

/**
 * Invalidates exactly the queries a successful write affects, and resolves
 * once the shown ones have refetched. The rest refetch when next shown.
 * Meanwhile it reads the Schedule snapshot again, without waiting for it, and
 * the snapshot stores them.
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
