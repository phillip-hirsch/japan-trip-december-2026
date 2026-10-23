import { hashKey, useQueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'

import { subscribeToQuery } from '@/trip/client/queries'
import { answeredAt } from '@/trip/client/read-order'

const minute = 60_000

const hour = 60 * minute

const day = 24 * hour

const ago = new Intl.RelativeTimeFormat('en-US', { numeric: 'always' })

/** How long ago `updatedAt` was at `now`, in its largest whole unit. */
const howLongAgo = (updatedAt: number, now: number) => {
  const elapsed = now - updatedAt

  if (elapsed < minute) return 'just now'

  if (elapsed < hour) return ago.format(-Math.floor(elapsed / minute), 'minute')

  if (elapsed < day) return ago.format(-Math.floor(elapsed / hour), 'hour')

  return ago.format(-Math.floor(elapsed / day), 'day')
}

/** How often the clock ticks, in milliseconds. */
const tickMs = 15_000

/**
 * Ticks the clock that shown times count from. It also ticks when the app is
 * shown again, because a hidden page's timers may not run.
 */
const subscribeToClock = (onTick: () => void) => {
  const timer = setInterval(onTick, tickMs)
  document.addEventListener('visibilitychange', onTick)

  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onTick)
  }
}

/**
 * The time, rounded down to the second, so React gets the same value both
 * times it reads it in one render.
 */
const currentSecond = () => Math.floor(Date.now() / 1000) * 1000

/**
 * A server render and the render that hydrates its page show no time. The
 * browser may have read the data again before a code-split page hydrates, so
 * any time they showed could differ.
 */
const notShownYet = () => undefined

/** The query a screen shows its data from. */
export interface ScreenQuery {
  readonly queryKey: QueryKey
}

export interface LastUpdatedTime {
  /** When the server last answered for the data, as an ISO instant. */
  readonly dateTime: string
  /** How the screen says it, such as "Updated 5 minutes ago". */
  readonly text: string
}

/**
 * When the server last answered for the data of `query`, as its screen shows
 * it. Undefined while the app holds no data for it, and in a server render
 * and the render that hydrates it.
 */
export const useLastUpdated = ({
  queryKey,
}: ScreenQuery): LastUpdatedTime | undefined => {
  const queryClient = useQueryClient()
  const queryHash = hashKey(queryKey)

  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeToQuery(queryClient, queryHash, onChange),
    [queryClient, queryHash],
  )

  const updatedAt = useSyncExternalStore(
    subscribe,
    () => {
      const state = queryClient.getQueryCache().get(queryHash)?.state

      return state === undefined ? undefined : answeredAt(state)
    },
    notShownYet,
  )

  const now = useSyncExternalStore(subscribeToClock, currentSecond, notShownYet)

  if (updatedAt === undefined || now === undefined) return undefined

  return {
    dateTime: new Date(updatedAt).toISOString(),
    text: `Updated ${howLongAgo(updatedAt, now)}`,
  }
}
