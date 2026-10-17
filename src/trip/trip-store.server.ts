import { env } from 'cloudflare:workers'
import { Effect, Schema } from 'effect'

import { runToPromise, tripRuntime } from '@/trip/runtime.server'
import { tripWriteOutcome } from '@/trip/trip-writes'
import type { TripWriteInput, TripWriteName } from '@/trip/trip-writes'
import type { TripStore } from '@/trip/TripStore'

const callStore = <S extends Schema.Decoder<unknown>, Encoded>(
  Result: S,
  call: (store: DurableObjectStub<TripStore>) => Promise<Encoded>,
) =>
  runToPromise(
    tripRuntime,
    Effect.promise(() =>
      call(env.TRIP_STORE.getByName('phillip', { locationHint: 'apac-ne' })),
    ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Result)), Effect.orDie),
  )

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
) => callStore(Result, call)

/**
 * Runs the Trip write named in the Trip store, decoding its outcome like
 * `callTripStore`. RPC types `write` for every name at once, so the outcome
 * schema of this name does the checking.
 */
export const callTripWrite = <K extends TripWriteName>(
  name: K,
  input: TripWriteInput<K>,
) =>
  callStore(
    tripWriteOutcome(name),
    async (store) => await store.write(name, input),
  )

/**
 * A server function's handler for the Trip write named, taking its input as
 * the function's validator decoded it.
 */
export const tripWriteHandler =
  <K extends TripWriteName>(name: K) =>
  ({ data }: { readonly data: TripWriteInput<K> }) =>
    callTripWrite(name, data)
