import { QueryClient } from '@tanstack/react-query'

// Tells React that this test renders through `act`, so it doesn't warn.
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** A query client for a hook test. It never retries a failed read. */
export const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })
