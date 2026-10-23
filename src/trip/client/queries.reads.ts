import { queryOptions } from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { keepLatestRead, readInOrder } from '@/trip/client/read-order'
import type { IsoDate } from '@/trip/domain/domain'
import {
  getChecklist,
  getDay,
  getHome,
  getScheduleById,
  getScheduleMap,
  getSchedules,
} from '@/trip/trip/trip.functions'

/**
 * One key per query, none a prefix of another, so invalidating one never
 * reaches the rest.
 */
export const keys = {
  home: ['home'],
  schedules: ['schedules'],
  days: ['days'],
  scheduleSummary: ['schedule-summary'],
  scheduleById: ['schedule-by-id'],
  checklist: ['checklist'],
  scheduleMap: ['schedule-map'],
  scheduleSnapshot: ['schedule-snapshot'],
} as const satisfies Record<string, QueryKey>

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

export const homeQuery = queryOptions({
  queryKey: keys.home,
  queryFn: readInOrder(() => getHome()),
  structuralSharing: keepLatestRead,
  refetchOnMount: false,
})

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
