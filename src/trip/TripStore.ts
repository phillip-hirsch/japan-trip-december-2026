// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-do'
import { DurableObject } from 'cloudflare:workers'
import { Effect, Exit, Layer, ManagedRuntime, Option } from 'effect'
import type { SqlClient } from 'effect/sql'

import type {
  ChooseItinerary,
  HomeState,
  IsoDate,
  RestoreSchedule,
  ScheduleDetail,
  ScheduleId,
  Schedules,
  ScheduleSummary,
  WriteDayNote,
} from '@/trip/domain'
import {
  ChooseOutcome,
  DayOutcome,
  RestoreOutcome,
  WriteDayNoteOutcome,
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

  /** Home's state at the moment of the request, in Tokyo. */
  home(): Promise<HomeState> {
    return this.#run(Trip.use((trip) => trip.home))
  }

  /**
   * One Day of Phillip's Schedule as its page shows it, no Schedule before
   * he chooses one, or DayNotFound for a date outside the Trip.
   */
  day(date: IsoDate): Promise<DayOutcome> {
    return this.#run(
      Trip.use((trip) => trip.day(date)).pipe(
        Effect.map(
          Option.match({
            onNone: (): DayOutcome => DayOutcome.cases.NoSchedule.make({}),
            onSome: (page): DayOutcome => DayOutcome.cases.Day.make({ page }),
          }),
        ),
        Effect.catchTag('DayNotFound', ({ date }) =>
          Effect.succeed<DayOutcome>(
            DayOutcome.cases.DayNotFound.make({ date }),
          ),
        ),
      ),
    )
  }

  /** Copies an Itinerary into Phillip's Schedule, archiving the current one. */
  choose(input: ChooseItinerary): Promise<ChooseOutcome> {
    return this.#run(
      Trip.use((trip) => trip.choose(input)).pipe(
        Effect.map((chosen): ChooseOutcome =>
          ChooseOutcome.cases.Chosen.make(chosen),
        ),
        Effect.catchTags({
          ItineraryNotFound: ({ optionNumber }) =>
            Effect.succeed<ChooseOutcome>(
              ChooseOutcome.cases.ItineraryNotFound.make({ optionNumber }),
            ),
          ScheduleChanged: () =>
            Effect.succeed<ChooseOutcome>(
              ChooseOutcome.cases.ScheduleChanged.make({}),
            ),
        }),
      ),
    )
  }

  /** Makes an archived Schedule current again, archiving the current one. */
  restore(input: RestoreSchedule): Promise<RestoreOutcome> {
    return this.#run(
      Trip.use((trip) => trip.restore(input)).pipe(
        Effect.map((restored): RestoreOutcome =>
          RestoreOutcome.cases.Restored.make(restored),
        ),
        Effect.catchTags({
          ScheduleNotFound: ({ scheduleId }) =>
            Effect.succeed<RestoreOutcome>(
              RestoreOutcome.cases.ScheduleNotFound.make({ scheduleId }),
            ),
          ScheduleChanged: () =>
            Effect.succeed<RestoreOutcome>(
              RestoreOutcome.cases.ScheduleChanged.make({}),
            ),
        }),
      ),
    )
  }

  /** Writes the Day note on a Day of the current Schedule, as a whole. */
  writeDayNote(input: WriteDayNote): Promise<WriteDayNoteOutcome> {
    return this.#run(
      Trip.use((trip) => trip.writeDayNote(input)).pipe(
        Effect.as<WriteDayNoteOutcome>(
          WriteDayNoteOutcome.cases.Written.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<WriteDayNoteOutcome>(
              WriteDayNoteOutcome.cases.ScheduleChanged.make({}),
            ),
          DayNotFound: ({ date }) =>
            Effect.succeed<WriteDayNoteOutcome>(
              WriteDayNoteOutcome.cases.DayNotFound.make({ date }),
            ),
          DayNoteTooLong: ({ maxLength }) =>
            Effect.succeed<WriteDayNoteOutcome>(
              WriteDayNoteOutcome.cases.DayNoteTooLong.make({ maxLength }),
            ),
        }),
      ),
    )
  }

  /** One Schedule, current or archived, or null when none has that id. */
  schedule(scheduleId: ScheduleId): Promise<ScheduleDetail | null> {
    return this.#run(
      Trip.use((trip) => trip.schedule(scheduleId)).pipe(
        Effect.catchTag('ScheduleNotFound', () => Effect.succeed(null)),
      ),
    )
  }

  /**
   * The current Schedule (null before Phillip chooses one) and the archived
   * ones, from one moment.
   */
  schedules(): Promise<Schedules> {
    return this.#run(
      Trip.use((trip) => trip.schedules).pipe(
        Effect.map(({ current, archived }) => ({
          current: Option.getOrNull(current),
          archived,
        })),
      ),
    )
  }

  /** The current Schedule's summary, or null before Phillip chooses one. */
  scheduleSummary(): Promise<ScheduleSummary | null> {
    return this.#run(
      Trip.use((trip) => trip.scheduleSummary).pipe(
        Effect.map(Option.getOrNull),
      ),
    )
  }
}
