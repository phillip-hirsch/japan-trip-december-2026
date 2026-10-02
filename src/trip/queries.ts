// The browser's cache of Trip server data, and which writes make it stale.
// Itinerary content changes only with a deploy, so its pages keep their route
// loaders; this cache holds what Phillip's writes change.
import {
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
  getDay,
  getHome,
  getScheduleById,
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
  /** The prefix of every Day page's query. */
  days: ['days'],
  scheduleSummary: ['schedule-summary'],
  /** The prefix of every query for one Schedule by its id. */
  scheduleById: ['schedule-by-id'],
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

/**
 * Home's state, kept on the right Day: it follows the date in Tokyo, so a
 * page left open across midnight there refetches, and the timer is set
 * again from each answer.
 */
export const useHome = () => {
  const queryClient = useQueryClient()
  const { data, dataUpdatedAt } = useSuspenseQuery(homeQuery)
  useEffect(() => {
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: keys.home }),
      // A moment past midnight, so the server is already on the new date.
      millisecondsUntilTokyoMidnight(Date.now()) + 1000,
    )
    return () => clearTimeout(timer)
  }, [queryClient, dataUpdatedAt])
  return data
}

/**
 * One Day of the current Schedule as its page shows it: null before a
 * Schedule exists. The date is a Day of the Trip; the route checks it first.
 */
export const dayQuery = (date: IsoDate) =>
  queryOptions({
    queryKey: [...keys.days, date],
    queryFn: () => getDay({ data: { date } }),
    refetchOnMount: false,
  })

/** The current Schedule and the archived ones, for /schedule. */
export const schedulesQuery = queryOptions({
  queryKey: keys.schedules,
  queryFn: () => getSchedules(),
  refetchOnMount: false,
})

/**
 * One Schedule by id, current or archived, for an archived Schedule's page:
 * null when none has that id.
 */
export const scheduleByIdQuery = (scheduleId: string) =>
  queryOptions({
    queryKey: [...keys.scheduleById, scheduleId],
    queryFn: () => getScheduleById({ data: { scheduleId } }),
    refetchOnMount: false,
  })

/**
 * The storage-dependent parts of every page, prerendered ones included, read
 * this: the navigation's Options or Schedule entry, the Choose button, and
 * "your Schedule came from this Itinerary".
 */
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

/** What replacing the current Schedule, by choosing or restoring, affects. */
const replacingTheSchedule = [
  keys.schedules,
  keys.days,
  keys.home,
  keys.scheduleSummary,
  keys.scheduleById,
] as const

/**
 * The invalidation contract: the queries each write affects. Every write
 * lists its own here.
 */
const affectedBy = {
  choose: replacingTheSchedule,
  restore: replacingTheSchedule,
} as const satisfies Record<string, ReadonlyArray<QueryKey>>

export type TripWrite = keyof typeof affectedBy

/**
 * Invalidates exactly the queries a successful write affects, and resolves
 * once the shown ones have refetched. The rest refetch when next shown.
 */
export const invalidateAfter = (queryClient: QueryClient, write: TripWrite) =>
  Promise.all(
    affectedBy[write].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
