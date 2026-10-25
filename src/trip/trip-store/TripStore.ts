// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient } from '@effect/sql-sqlite-do'
import { DurableObject } from 'cloudflare:workers'
import { Effect, Exit, Layer, ManagedRuntime } from 'effect'
import type { SqlClient } from 'effect/sql'

import { Itineraries } from '@/trip/itineraries/Itineraries'
import { runToPromise } from '@/trip/trip/runtime.server'
import { Trip } from '@/trip/trip/Trip'
import { startStore } from '@/trip/trip-store/store-start'
import { runTripOperation } from '@/trip/trip-store/trip-operations'
import type {
  TripOperationInput,
  TripOperationName,
  TripOperationResult,
} from '@/trip/trip-store/trip-operations'

/**
 * The one SQLite-backed Durable Object holding all of Phillip's editable data
 * (ADR 0001). Its one RPC method runs a Trip operation, named in the registry
 * (trip-operations.ts), over the object's own storage. Only plain encoded
 * data crosses RPC. Results are plain structs, and typed failures become
 * outcomes.
 */
export class TripStore extends DurableObject<Env> {
  readonly #runtime: ManagedRuntime.ManagedRuntime<
    Trip | SqlClient.SqlClient,
    never
  >
  #started: Exit.Exit<unknown, unknown> | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#runtime = ManagedRuntime.make(
      Layer.merge(Trip.live, SqliteClient.layer({ storage: ctx.storage })),
    )
    // Requests wait until store start finishes: the migrations, then the
    // Schedule if the store has none. A failed start rolls back and its
    // failure is kept, so every request fails explicitly rather than run
    // against a partial schema or without a Schedule. (Throwing here instead
    // would reset the object and quietly retry on the next request.)
    void ctx.blockConcurrencyWhile(async () => {
      this.#started = await this.#runtime.runPromiseExit(
        startStore.pipe(
          Effect.provide(Itineraries.layer),
          Effect.tapCause(Effect.logError),
        ),
      )
    })
  }

  /**
   * Runs the Trip operation named and returns its result, or its typed
   * failure as its outcome, as plain data.
   */
  run<K extends TripOperationName>(
    name: K,
    input: TripOperationInput<K>,
  ): Promise<TripOperationResult<K>> {
    if (this.#started === undefined || Exit.isFailure(this.#started)) {
      return Promise.reject(
        new Error('The Trip store refuses requests: its start failed.'),
      )
    }

    return runToPromise(this.#runtime, runTripOperation(name, input))
  }
}
