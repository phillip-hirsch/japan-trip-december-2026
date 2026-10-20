import {
  hashKey,
  onlineManager,
  partialMatchKey,
  queryOptions,
  replaceEqualDeep,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type {
  FetchQueryOptions,
  Query,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'
import { Predicate } from 'effect'
import { useEffect } from 'react'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'
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
 * Resolves with the data stored for `queryKey` once the app is offline and
 * has some, whichever comes second, such as a snapshot storing a Day after
 * the connection dropped. `stop` ends the listening.
 */
const storedOnceOffline = <TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
) => {
  let stop = () => {}

  const answer = new Promise<TData>((resolve) => {
    const answerIfOffline = () => {
      const data = queryClient.getQueryData<TData>(queryKey)

      if (data !== undefined && isOffline()) resolve(data)
    }

    const queryHash = hashKey(queryKey)
    const stopOnline = onlineManager.subscribe(answerIfOffline)
    const stopConnection = subscribeToConnection(answerIfOffline)

    const stopStoring = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === queryHash) answerIfOffline()
    })

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
 * then stores. Offline, it answers at once with the data the app already
 * has instead of waiting for the network, also when the app goes offline
 * during the read. With nothing stored, it fails: at once when the browser
 * knows it is offline, where `fetchQuery` would wait for the network,
 * otherwise as the read does.
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

  const offline = storedOnceOffline<TData>(queryClient, options.queryKey)

  try {
    return await Promise.race([
      queryClient.fetchQuery(options).then((fetched) => stored() ?? fetched),
      offline.answer,
    ])
  } catch (error) {
    const after = stored()

    if (after !== undefined && isOffline()) return after
    throw error
  } finally {
    offline.stop()
  }
}

/**
 * When the read of each stored answer started, counted in the order reads
 * start. The Schedules, the Days and the Checklist store an answer only if
 * no answer from a later read is stored, whichever arrives last, so a slow
 * read never rolls back a newer one. Every Schedule snapshot that fills them
 * keeps to the same order.
 */
const readStarts = new WeakMap<object, number>()

let readsStarted = 0

const startRead = () => ++readsStarted

/** Marks `answer` as from a read that started `started`. */
const answerOfRead = <T>(answer: T, started: number) => {
  if (Predicate.isObject(answer)) readStarts.set(answer, started)

  return answer
}

/** A query function whose answers keep to the read order. */
const readInOrder =
  <T>(read: () => Promise<T>) =>
  async () => {
    const started = startRead()

    return answerOfRead(await read(), started)
  }

const readStartOf = <T>(answer: T) =>
  Predicate.isObject(answer) ? readStarts.get(answer) : undefined

/**
 * Runs as the cache stores an answer, read or filled, and keeps the stored
 * one if its read started later. An answer with no recorded read, such as
 * one the server rendered into the page, counts as the oldest when stored
 * and the newest when arriving.
 *
 * A null answer can't carry its read, but only a Day read before any
 * Schedule exists answers null. Once one exists, one is always current, so
 * a null arriving over a stored answer is from a read that started before.
 */
const keepLatestRead = <T>(stored: T | undefined, arriving: T): T => {
  const arrivingStart = readStartOf(arriving)

  if (stored !== undefined && stored !== null && arriving === null) {
    return stored
  }

  if (
    stored !== undefined &&
    arrivingStart !== undefined &&
    (readStartOf(stored) ?? 0) > arrivingStart
  ) {
    return stored
  }

  const kept = replaceEqualDeep(stored, arriving)

  return arrivingStart === undefined ? kept : answerOfRead(kept, arrivingStart)
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
    queryFn: readInOrder(() => getDay({ data: { date } })),
    structuralSharing: keepLatestRead,
    refetchOnMount: false,
  })

export const schedulesQuery = queryOptions({
  queryKey: keys.schedules,
  queryFn: readInOrder(() => getSchedules()),
  structuralSharing: keepLatestRead,
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
  queryFn: readInOrder(() => getChecklist()),
  structuralSharing: keepLatestRead,
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
 * whose read started `started`, each unless a later read is stored. It
 * builds each query with its own options first, so a Day never read on its
 * own keeps to the read order too.
 */
const storeSnapshot = (
  queryClient: QueryClient,
  snapshot: SnapshotAnswer,
  started: number,
) => {
  if (snapshot === null) return

  const store = <T, K extends QueryKey>(
    options: FetchQueryOptions<T, Error, T, K>,
    data: T,
  ) => {
    queryClient.getQueryCache().build(queryClient, options)
    queryClient.setQueryData<T>(options.queryKey, answerOfRead(data, started))
  }

  store(schedulesQuery, snapshot.schedules)

  for (const page of snapshot.days) store(dayQuery(page.day.date), page)

  store(checklistQuery, snapshot.checklist)
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
