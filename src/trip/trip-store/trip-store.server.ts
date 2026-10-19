import { env } from 'cloudflare:workers'
import { Effect, Schema } from 'effect'

import { runToPromise, tripRuntime } from '@/trip/trip/runtime.server'
import { tripOperationResult } from '@/trip/trip-store/trip-operations'
import type {
  TripOperationInput,
  TripOperationName,
} from '@/trip/trip-store/trip-operations'

/**
 * Runs the Trip operation named in the one Trip store, called over RPC by its
 * fixed name. The location hint only counts when the object is first
 * created, which pins it near Japan for good (ADR 0001).
 *
 * The operation's result schema decodes the result. That checks it and drops
 * the disposer RPC adds. RPC types `run` for every name at once, so the
 * schema ties the result to this name. A failed call or decode is logged and
 * reaches the browser as a generic error.
 */
export const callTripOperation = <K extends TripOperationName>(
  name: K,
  input: TripOperationInput<K>,
) =>
  runToPromise(
    tripRuntime,
    // Awaiting turns RPC's union of per-name promises into one promise.
    Effect.promise(
      async () =>
        await env.TRIP_STORE.getByName('phillip', {
          locationHint: 'apac-ne',
        }).run(name, input),
    ).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(tripOperationResult(name))),
      Effect.orDie,
    ),
  )

/**
 * A server function's handler for the Trip operation named, taking its input
 * as the function's validator decoded it.
 */
export const tripOperationHandler =
  <K extends TripOperationName>(name: K) =>
  ({ data }: { readonly data: TripOperationInput<K> }) =>
    callTripOperation(name, data)
