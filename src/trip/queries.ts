// The browser's cache of Trip server data, and which writes make it stale.
// Itinerary content changes only with a deploy, so its pages keep their route
// loaders; this cache holds what Phillip's writes change.
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'

import { getHome, getSchedule, getScheduleSummary } from '@/trip/trip.functions'

/**
 * One key per query, none a prefix of another, so invalidating one never
 * reaches the rest.
 */
const keys = {
  home: ['home'],
  schedule: ['schedule'],
  /** The prefix of every Day page's query. */
  days: ['days'],
  scheduleSummary: ['schedule-summary'],
} as const satisfies Record<string, QueryKey>

export const homeQuery = queryOptions({
  queryKey: keys.home,
  queryFn: () => getHome(),
})

export const scheduleQuery = queryOptions({
  queryKey: keys.schedule,
  queryFn: () => getSchedule(),
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

/**
 * The invalidation contract: the queries each write affects. Every write
 * lists its own here.
 */
const affectedBy = {
  choose: [keys.schedule, keys.days, keys.home, keys.scheduleSummary],
} as const satisfies Record<string, ReadonlyArray<QueryKey>>

export type TripWrite = keyof typeof affectedBy

/**
 * Invalidates exactly the queries a successful write affects, and resolves
 * once each cached one has refetched, shown or not: a loader reuses cached
 * data, so a page opened next must not find it stale.
 */
export const invalidateAfter = (queryClient: QueryClient, write: TripWrite) =>
  Promise.all(
    affectedBy[write].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType: 'all' }),
    ),
  )
