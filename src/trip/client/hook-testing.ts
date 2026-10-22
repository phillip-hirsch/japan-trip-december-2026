import { QueryClient } from '@tanstack/react-query'
import { act } from 'react'

import { offline, reportConnection } from '@/access/connection-status'
import { queryDefaults } from '@/trip/client/query-client'

// Tells React that this test renders through `act`, so it doesn't warn.
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/**
 * A query client for a hook test, with the app's query defaults. It never
 * retries a failed read.
 */
export const testQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { ...queryDefaults, retry: false } },
  })

/** Lets pending reads answer and the renders they cause finish. */
export const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

/** Whether a loader's read answers or fails. */
export const outcomeOf = (read: Promise<unknown>) =>
  read.then(
    () => 'answered',
    () => 'failed',
  )

/** A read that never reaches the server, as the transport reports it. */
export const serverOutOfReach = async (): Promise<never> => {
  reportConnection(offline)
  throw new TypeError('Failed to fetch')
}
