import {
  partialMatchKey,
  queryOptions,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'

import { millisecondsUntilTokyoMidnight } from '@/trip/calendar'
import type { IsoDate } from '@/trip/domain'
import {
  getChecklist,
  getDay,
  getHome,
  getScheduleById,
  getScheduleMap,
  getSchedules,
  getScheduleSummary,
} from '@/trip/trip.functions'

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
} as const satisfies Record<string, QueryKey>

// A page shown again must not open on data another device has since changed,
// and only shown queries refetch on focus and reconnect. So loaders fetch
// these with `fetchQuery`, which waits for fresh data whenever the cache is
// stale (not `ensureQueryData`, which returns whatever is cached), and set
// `staleReloadMode: 'blocking'`, so the router waits for that too instead of
// rendering its cached match first. The page then mounts on what its loader
// just fetched, so mounting never fetches again.

export const homeQuery = queryOptions({
  queryKey: keys.home,
  queryFn: () => getHome(),
  refetchOnMount: false,
})

const retryDelay = 60_000

/**
 * Home's state, kept on the right Day. It follows the date in Tokyo, so each
 * answer schedules a refetch a moment past the next Tokyo midnight after the
 * moment the server read it at (not after the answer arrived, which may be
 * past that midnight already): an answer already overdue refetches at once,
 * and a refetch that fails is tried again until one answers.
 */
export const useHome = () => {
  const queryClient = useQueryClient()
  const { data, dataUpdatedAt, errorUpdatedAt } = useSuspenseQuery(homeQuery)
  const readAt = Date.parse(data.readAt)
  useEffect(() => {
    const deadline = readAt + millisecondsUntilTokyoMidnight(readAt) + 1000
    const overdue = Date.now() >= deadline
    const failedSince = errorUpdatedAt > dataUpdatedAt

    const delay =
      overdue && failedSince ? retryDelay : Math.max(deadline - Date.now(), 0)

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
    queryFn: () => getDay({ data: { date } }),
    refetchOnMount: false,
  })

export const schedulesQuery = queryOptions({
  queryKey: keys.schedules,
  queryFn: () => getSchedules(),
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
  queryFn: () => getChecklist(),
  refetchOnMount: false,
})

export const scheduleMapQuery = queryOptions({
  queryKey: keys.scheduleMap,
  queryFn: () => getScheduleMap(),
  refetchOnMount: false,
})

const scheduleSummaryQuery = queryOptions({
  queryKey: keys.scheduleSummary,
  queryFn: () => getScheduleSummary(),
})

/**
 * The Schedule summary: undefined until it first answers, then null before a
 * Schedule exists. `useQuery` only fetches in the browser, after hydration.
 */
export const useScheduleSummary = () => useQuery(scheduleSummaryQuery).data

/**
 * Whether a server render may carry a query into the page. Never the Schedule
 * summary, even if a loader fetched it, so prerendered HTML can't contain it.
 */
export const shouldDehydrateQuery = (query: Query) =>
  query.queryKey[0] !== keys.scheduleSummary[0]

const replacingTheSchedule = [
  keys.schedules,
  keys.days,
  keys.home,
  keys.scheduleSummary,
  keys.scheduleById,
  keys.checklist,
  keys.scheduleMap,
] as const

const affectedBy = {
  choose: replacingTheSchedule,
  restore: replacingTheSchedule,
  // Every query carrying the current Schedule's Days: the Day pages, Today
  // on Home, and the Schedule itself, by id too.
  dayNote: [keys.days, keys.home, keys.schedules, keys.scheduleById],
  // Activities are carried by the Days, as Day notes are, and a pinned one
  // shows on the map.
  activity: [
    keys.days,
    keys.home,
    keys.schedules,
    keys.scheduleById,
    keys.scheduleMap,
  ],
  // Every query carrying the current Schedule's Stays: the Schedule on Home
  // before and after the Trip, and the Schedule itself, by id too.
  stayNote: [keys.home, keys.schedules, keys.scheduleById],
  // Hotel details show with the Stays, as tonight's hotel on the Day pages
  // and Today on Home, and with a pinned hotel on the map.
  hotelDetails: [
    keys.days,
    keys.home,
    keys.schedules,
    keys.scheduleById,
    keys.scheduleMap,
  ],
  // A Stay edit changes the Stays, the Moves and Days they make, Tonight's
  // hotel and the Next Move, the Anchor warnings, the derived Checklist and
  // the map.
  stayEdit: [
    keys.schedules,
    keys.days,
    keys.home,
    keys.scheduleById,
    keys.checklist,
    keys.scheduleMap,
  ],
  // An Activity's Pin shows with its Day, and the hotel's with its Stay and
  // as tonight's hotel. Both appear on the Day pages, Today on Home, the
  // Schedule and the map.
  pin: [
    keys.days,
    keys.home,
    keys.schedules,
    keys.scheduleById,
    keys.scheduleMap,
  ],
  // The Trip note shows only with the Schedules on /schedule.
  tripNote: [keys.schedules],
  // Ticks, own items added and own items removed show only on /checklist.
  checklist: [keys.checklist],
} as const satisfies Record<string, ReadonlyArray<QueryKey>>

export type TripWrite = keyof typeof affectedBy

const invalidate = (
  queryClient: QueryClient,
  queryKeys: ReadonlyArray<QueryKey>,
) =>
  Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )

/**
 * Invalidates exactly the queries a successful write affects, and resolves
 * once the shown ones have refetched. The rest refetch when next shown.
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
