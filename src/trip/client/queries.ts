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
  QueryKey,
} from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'
import { Match } from 'effect'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'
import { deviceCacheRestoring } from '@/trip/client/device-cache'
import {
  answerOfRead,
  keepLatestRead,
  readInOrder,
  startRead,
} from '@/trip/client/read-order'
import type { Read } from '@/trip/client/read-order'
import {
  isTripDate,
  millisecondsUntilTokyoMidnight,
  tokyoDateAt,
} from '@/trip/domain/calendar'
import type { HomeState, IsoDate, Schedules } from '@/trip/domain/domain'
import { homeStateOn } from '@/trip/domain/home-state'
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

/**
 * Calls `listener` whenever the query with `queryHash` changes, and returns a
 * function that stops it. `hashKey` gives a query's hash.
 */
export const subscribeToQuery = (
  queryClient: QueryClient,
  queryHash: string,
  listener: () => void,
) =>
  queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash === queryHash) listener()
  })

const isOffline = () =>
  !onlineManager.isOnline() ||
  ConnectionStatus.$is('Offline')(currentConnection())

/**
 * Resolves with the data stored for `queryKey` as soon as the app is offline
 * and has data stored for it. The two can happen in either order, such as a
 * snapshot storing a Day after the connection dropped. `stop` removes the
 * listeners.
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

    const stopOnline = onlineManager.subscribe(answerIfOffline)
    const stopConnection = subscribeToConnection(answerIfOffline)

    const stopStoring = subscribeToQuery(
      queryClient,
      hashKey(queryKey),
      answerIfOffline,
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
 * then stores. Offline, it answers at once with the data the app already
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

  const offline = storedOnceOffline<TData>(queryClient, options.queryKey)

  try {
    return await Promise.race([
      queryClient.fetchQuery(options).then((fetched) => stored() ?? fetched),
      offline.answer,
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
    offline.stop()
  }
}

export const homeQuery = queryOptions({
  queryKey: keys.home,
  queryFn: () => getHome(),
  refetchOnMount: false,
})

const homeRetryDelay = 60_000

const nextTokyoMidnightDeadline = (readAt: number) =>
  readAt + millisecondsUntilTokyoMidnight(readAt) + 1000

/**
 * Calls `onChange` at each Tokyo midnight, and when the page is shown again,
 * because a hidden page's timers may not run. Returns how to stop.
 */
const subscribeToTokyoMidnight = (onChange: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined

  const waitForMidnight = () => {
    timer = setTimeout(() => {
      onChange()
      waitForMidnight()
    }, millisecondsUntilTokyoMidnight(Date.now()))
  }

  waitForMidnight()
  document.addEventListener('visibilitychange', onChange)

  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onChange)
  }
}

/**
 * The data the app stores for `query`, updated as the cache changes. It never
 * fetches, and doesn't count as showing the query. Undefined for no query.
 */
const useStored = <TData, TKey extends QueryKey>(
  query: FetchQueryOptions<TData, Error, TData, TKey> | undefined,
) => {
  const queryClient = useQueryClient()
  const queryHash = query && hashKey(query.queryKey)

  const subscribe = useCallback(
    (onChange: () => void) =>
      queryHash === undefined
        ? () => {}
        : subscribeToQuery(queryClient, queryHash, onChange),
    [queryClient, queryHash],
  )

  const held = () => query && queryClient.getQueryData<TData>(query.queryKey)

  return useSyncExternalStore(subscribe, held, held)
}

/**
 * Home for the current Tokyo date, and the query its data came from, for the
 * "last updated" time. It is Home as last read until the Tokyo date passes
 * the date Home was read on. From then until Home is read again, it is built
 * for the new date from the stored Schedules and Day page, so it moves on
 * offline too. It never moves back when the device clock runs behind the
 * server's, and it stays as last read when the new date's Day isn't stored.
 */
export const useHome = () => {
  const queryClient = useQueryClient()
  const { data, dataUpdatedAt, errorUpdatedAt } = useSuspenseQuery(homeQuery)
  const readAt = Date.parse(data.readAt)
  const readOn = tokyoDateAt(readAt)

  // A server render and the render hydrating it show Home as read, so the
  // two match.
  const today = useSyncExternalStore(
    subscribeToTokyoMidnight,
    () => tokyoDateAt(Date.now()),
    () => readOn,
  )

  const movedOn = today > readOn

  const schedules = useStored(movedOn ? schedulesQuery : undefined)

  const page = useStored(
    movedOn && isTripDate(today) ? dayQuery(today) : undefined,
  )

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

  const asRead = { home: data, query: homeQuery }

  if (!movedOn) return asRead

  const { schedule, from } = scheduleToMoveOnWith(
    scheduleIn(data),
    data.readAt,
    schedules,
  )

  if (schedule === undefined) return asRead
  const showsDay = schedule !== null && isTripDate(today)

  // A Day stored from another Schedule, such as one replaced on another
  // device before the last snapshot answered, isn't Today.
  if (showsDay && page?.scheduleId !== schedule.id) return asRead

  return {
    home: homeStateOn(today, {
      readAt: data.readAt,
      itineraries: data.itineraries,
      schedule,
      today: showsDay ? (page ?? null) : null,
    }),
    query: showsDay ? dayQuery(today) : from,
  }
}

/**
 * The Schedule Home was read with: its id, null for none, and its detail.
 * During the Trip Home carries only the id, so its detail is undefined.
 */
const scheduleIn = (home: HomeState) =>
  Match.value(home).pipe(
    Match.tagsExhaustive({
      BeforeTrip: ({ schedule }) => ({
        id: schedule?.id ?? null,
        detail: schedule,
      }),
      DuringTrip: ({ today }) => ({
        id: today?.scheduleId ?? null,
        detail: undefined,
      }),
      AfterTrip: ({ schedule }) => ({
        id: schedule?.id ?? null,
        detail: schedule,
      }),
    }),
  )

/**
 * The Schedule Home moves on with offline, and the query it came from:
 * whichever of Home and the stored Schedules the server answered later.
 * Undefined when the later one lacks it, as Home during the Trip carries only
 * its Schedule's id.
 */
const scheduleToMoveOnWith = (
  readWith: ReturnType<typeof scheduleIn>,
  readAt: string,
  schedules: Schedules | undefined,
) => {
  if (
    schedules !== undefined &&
    storedAreLater(readWith.id, readAt, schedules)
  ) {
    return { schedule: schedules.current, from: schedulesQuery }
  }

  if (readWith.id === null || readWith.detail !== undefined) {
    return { schedule: readWith.detail ?? null, from: homeQuery }
  }

  return { schedule: undefined, from: homeQuery }
}

/**
 * Whether the server answered the stored Schedules later than Home, read at
 * `readAt` with the Schedule `homeScheduleId`. Both times are the server's,
 * so a device clock set wrong can't reorder them. A Schedule never goes back
 * to none, and choosing or restoring archives the Schedule it replaces. So
 * the stored Schedules are later when they hold the same Schedule as Home,
 * when Home had none and they have one, or when they archived Home's after
 * Home was read.
 */
const storedAreLater = (
  homeScheduleId: string | null,
  readAt: string,
  { current, archived }: Schedules,
) => {
  if (homeScheduleId === null) return current !== null

  if (current?.id === homeScheduleId) return true

  return archived.some(
    ({ id, archivedAt }) =>
      id === homeScheduleId && Date.parse(archivedAt) > Date.parse(readAt),
  )
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

/** What the snapshot's server function returns, as plain data. */
type SnapshotAnswer = Awaited<ReturnType<typeof getScheduleSnapshot>>

/**
 * Stores the Schedules, every Day page and the Checklist from the snapshot
 * that `read` answered. It skips any of them already stored from a later
 * read. It builds each query with its own options first, so a Day that was
 * never read on its own still checks the read numbers.
 */
const storeSnapshot = (
  queryClient: QueryClient,
  snapshot: SnapshotAnswer,
  read: Read,
) => {
  if (snapshot === null) return

  const store = <T, K extends QueryKey>(
    options: FetchQueryOptions<T, Error, T, K>,
    data: T,
  ) => {
    queryClient.getQueryCache().build(queryClient, options)
    queryClient.setQueryData<T>(options.queryKey, answerOfRead(data, read), {
      updatedAt: read.answeredAt,
    })
  }

  store(schedulesQuery, snapshot.schedules)

  for (const page of snapshot.days) store(dayQuery(page.day.date), page)

  store(checklistQuery, snapshot.checklist)
}

const scheduleSnapshotQuery = queryOptions({
  queryKey: keys.scheduleSnapshot,
  // The device keeps the Schedules, Days and Checklist the snapshot stores,
  // so keeping the snapshot too would store a second copy.
  meta: { kept: false },
  queryFn: async ({ client, signal }) => {
    const started = startRead()
    const snapshot = await getScheduleSnapshot()
    const read = { started, answeredAt: Date.now() }

    // A read cancelled for a write may predate it, so it stores nothing.
    if (!signal.aborted) storeSnapshot(client, snapshot, read)

    return snapshot
  },
})

/**
 * Stores the Schedules, every Day page and the Checklist from the Schedule
 * snapshot, so any Day opens offline, even one never opened on this device.
 * They all come from one snapshot, except any stored from a later read. It reads
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

/**
 * Invalidates the queries given. It also reads the Schedule snapshot again,
 * without waiting for it.
 */
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
