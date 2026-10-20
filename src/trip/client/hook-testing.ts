import { QueryClient } from '@tanstack/react-query'

// Importing this marks the test as one that renders through `act`.
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** A query client for a hook test: a failed read fails at once. */
export const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })
