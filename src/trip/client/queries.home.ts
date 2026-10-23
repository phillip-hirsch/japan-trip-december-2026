import {
  hashKey,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import type { FetchQueryOptions, QueryKey } from '@tanstack/react-query'
import { Match } from 'effect'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import {
  dayQuery,
  homeQuery,
  keys,
  schedulesQuery,
  subscribeToQuery,
} from '@/trip/client/queries.reads'
import {
  isTripDate,
  millisecondsUntilTokyoMidnight,
  tokyoDateAt,
} from '@/trip/domain/calendar'
import type { HomeState, Schedules } from '@/trip/domain/domain'
import { homeStateOn } from '@/trip/domain/home-state'

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
 * whichever of Home and the stored Schedules the server answered later, else
 * Home's own. Undefined when that lacks it, as Home during the Trip carries
 * only its Schedule's id.
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

  // During the Trip Home carries only its Schedule's id, so the stored
  // Schedule stands in for it when it's the same one.
  return schedules?.current?.id === readWith.id
    ? { schedule: schedules.current, from: schedulesQuery }
    : { schedule: undefined, from: homeQuery }
}

/**
 * Whether the server answered the stored Schedules later than Home, read at
 * `readAt` with the Schedule `homeScheduleId`. Both times are the server's,
 * so a device clock set wrong can't reorder them. A Schedule never goes back
 * to none, and choosing or restoring archives the Schedule it replaces. So
 * the stored Schedules are later when Home had none and they have one, or
 * when they archived Home's at or after the moment Home was read: Home saw
 * it current, so it was archived later. Holding the same Schedule as Home
 * proves neither is later.
 */
const storedAreLater = (
  homeScheduleId: string | null,
  readAt: string,
  { current, archived }: Schedules,
) => {
  if (homeScheduleId === null) return current !== null

  return archived.some(
    ({ id, archivedAt }) =>
      id === homeScheduleId && Date.parse(archivedAt) >= Date.parse(readAt),
  )
}
