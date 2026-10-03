import { env } from 'cloudflare:workers'
import { Effect, Schema } from 'effect'

import { runToPromise, tripRuntime } from '@/trip/runtime.server'
import type { TripStore } from '@/trip/TripStore'

/**
 * Calls the one Trip store over RPC, by its fixed name. The location hint
 * only counts when the object is first created, which pins it near Japan for
 * good (ADR 0001).
 *
 * The result is decoded with its schema, which checks it and leaves only its
 * plain data, without the disposer RPC adds. A failed call or decode is
 * logged and reaches the browser as a generic error.
 */
export const callTripStore = <S extends Schema.Decoder<unknown>>(
  Result: S,
  call: (store: DurableObjectStub<TripStore>) => Promise<S['Encoded']>,
) =>
  runToPromise(
    tripRuntime,
    Effect.promise(() =>
      call(env.TRIP_STORE.getByName('phillip', { locationHint: 'apac-ne' })),
    ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Result)), Effect.orDie),
  )
