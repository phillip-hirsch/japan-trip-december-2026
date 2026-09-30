import { ManagedRuntime } from 'effect'

import { Trip } from '@/trip/Trip'

/**
 * One runtime per isolate. It holds only layers that need no Cloudflare
 * binding and cannot fail, because a failed build would be cached for the
 * isolate's lifetime.
 */
export const tripRuntime = ManagedRuntime.make(Trip.layer)
