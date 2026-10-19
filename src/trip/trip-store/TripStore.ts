// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-do'
import { DurableObject } from 'cloudflare:workers'
import { Effect, Exit, Layer, ManagedRuntime } from 'effect'
import type { SqlClient } from 'effect/sql'

import { migrations } from '@/trip/schedule-store/migrations'
import { runToPromise } from '@/trip/trip/runtime.server'
import { Trip } from '@/trip/trip/Trip'
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
  #migrated: Exit.Exit<unknown, unknown> | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#runtime = ManagedRuntime.make(
      Layer.merge(Trip.live, SqliteClient.layer({ storage: ctx.storage })),
    )
    // Requests wait until the migrations finish. A failed migration rolls
    // back and its failure is kept, so every request fails explicitly rather
    // than run against a partial schema. (Throwing here instead would reset
    // the object and quietly retry on the next request.)
    void ctx.blockConcurrencyWhile(async () => {
      this.#migrated = await this.#runtime.runPromiseExit(
        SqliteMigrator.run({ loader: migrations }).pipe(
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
    if (this.#migrated === undefined || Exit.isFailure(this.#migrated)) {
      return Promise.reject(
        new Error('The Trip store refuses requests: its migrations failed.'),
      )
    }

    return runToPromise(this.#runtime, runTripOperation(name, input))
  }
}
