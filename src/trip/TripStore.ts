// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-do'
import { DurableObject } from 'cloudflare:workers'
import { Effect, Exit, Layer, ManagedRuntime, Option } from 'effect'
import type { SqlClient } from 'effect/sql'

import type {
  ChooseItinerary,
  ChooseOutcome,
  ScheduleDetail,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { migrations } from '@/trip/migrations'
import { runToPromise } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'

/**
 * The one SQLite-backed Durable Object holding all of Phillip's editable data
 * (ADR 0001). Its RPC methods run the Trip service's storage operations over
 * the object's own storage. Only plain encoded data crosses RPC: results are
 * plain structs, and typed failures become outcomes.
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
      Layer.merge(
        Trip.layer.pipe(Layer.provide(Itineraries.layer)),
        SqliteClient.layer({ storage: ctx.storage }),
      ),
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

  #run<A>(operation: Effect.Effect<A, never, Trip | SqlClient.SqlClient>) {
    if (this.#migrated === undefined || Exit.isFailure(this.#migrated)) {
      return Promise.reject(
        new Error('The Trip store refuses requests: its migrations failed.'),
      )
    }
    return runToPromise(this.#runtime, operation)
  }

  /** Copies an Itinerary into Phillip's Schedule. */
  choose(input: ChooseItinerary): Promise<ChooseOutcome> {
    return this.#run(
      Trip.use((trip) => trip.choose(input)).pipe(
        Effect.map((chosen): ChooseOutcome => ({ _tag: 'Chosen', ...chosen })),
        Effect.catchTags({
          ItineraryNotFound: ({ optionNumber }) =>
            Effect.succeed<ChooseOutcome>({
              _tag: 'ItineraryNotFound',
              optionNumber,
            }),
          ScheduleAlreadyChosen: ({ sourceOptionNumber }) =>
            Effect.succeed<ChooseOutcome>({
              _tag: 'ScheduleAlreadyChosen',
              sourceOptionNumber,
            }),
        }),
      ),
    )
  }

  /** The current Schedule, or null before Phillip chooses one. */
  currentSchedule(): Promise<ScheduleDetail | null> {
    return this.#run(
      Trip.use((trip) => trip.currentSchedule).pipe(
        Effect.map(Option.getOrNull),
      ),
    )
  }
}
