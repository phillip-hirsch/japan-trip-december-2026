import { Effect, Exit, Layer, ManagedRuntime } from 'effect'

import { Itineraries } from '@/trip/Itineraries'
import { Trip } from '@/trip/Trip'

/**
 * One runtime per isolate. It holds only layers that need no Cloudflare
 * binding and cannot fail, because a failed build would be cached for the
 * isolate's lifetime.
 */
export const tripRuntime = ManagedRuntime.make(
  Trip.layer.pipe(Layer.provide(Itineraries.layer)),
)

/**
 * Runs an operation to a promise at a boundary Effect doesn't cross.
 *
 * - The caller maps each typed failure first, to a serialisable result or to
 *   a value it turns into `notFound()`, so only defects remain.
 * - A defect is logged here and reaches the caller as a generic error, so no
 *   stack or internal detail crosses the wire.
 * - The service returns plain Schema struct values, which are already in
 *   their encoded form; never return Schema class instances, which the
 *   serialiser rejects.
 */
export const runToPromise = async <A, R>(
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
  operation: Effect.Effect<A, never, R>,
): Promise<A> => {
  const exit = await runtime.runPromiseExit(
    operation.pipe(Effect.tapCause(Effect.logError)),
  )
  if (Exit.isFailure(exit)) throw new Error('The Trip service failed.')
  return exit.value
}

/** The adapter every server function uses to call the Trip service. */
export const runTrip = <A>(operation: Effect.Effect<A, never, Trip>) =>
  runToPromise(tripRuntime, operation)
