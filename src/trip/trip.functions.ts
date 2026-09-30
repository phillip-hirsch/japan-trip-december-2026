import { createServerFn } from '@tanstack/react-start'

import { tripRuntime } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'

/** Home's state at the moment of the request. */
export const getHome = createServerFn({ method: 'GET' }).handler(() =>
  tripRuntime.runPromise(Trip.use((trip) => trip.home)),
)
