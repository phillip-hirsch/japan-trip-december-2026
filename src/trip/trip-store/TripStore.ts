// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-do'
import { DurableObject } from 'cloudflare:workers'
import { Effect, Exit, Layer, ManagedRuntime, Option } from 'effect'
import type { SqlClient } from 'effect/sql'

import type {
  ChangeStayBase,
  Checklist,
  ChooseItinerary,
  HardRuleBroken,
  HomeState,
  IsoDate,
  MergeStays,
  MoveStayBoundary,
  RestoreSchedule,
  ScheduleChanged,
  ScheduleDetail,
  ScheduleId,
  ScheduleMap,
  Schedules,
  ScheduleSummary,
  SplitStay,
  StayNotFound,
  StaysEdited,
} from '@/trip/domain/domain'
import {
  ChooseOutcome,
  DayOutcome,
  RestoreOutcome,
  StayEditOutcome,
} from '@/trip/domain/domain'
import { migrations } from '@/trip/schedule-store/migrations'
import { runToPromise } from '@/trip/trip/runtime.server'
import { Trip } from '@/trip/trip/Trip'
import { runTripWrite } from '@/trip/trip-store/trip-writes'
import type {
  TripWriteInput,
  TripWriteName,
  TripWriteOutcome,
} from '@/trip/trip-store/trip-writes'

export const stayEditOutcomeOf = <R>(
  edit: Effect.Effect<
    StaysEdited,
    ScheduleChanged | StayNotFound | HardRuleBroken,
    R
  >,
) =>
  edit.pipe(
    Effect.map((edited): StayEditOutcome =>
      StayEditOutcome.cases.Edited.make(edited),
    ),
    Effect.catchTags({
      ScheduleChanged: () =>
        Effect.succeed<StayEditOutcome>(
          StayEditOutcome.cases.ScheduleChanged.make({}),
        ),
      StayNotFound: ({ stayId }) =>
        Effect.succeed<StayEditOutcome>(
          StayEditOutcome.cases.StayNotFound.make({ stayId }),
        ),
      HardRuleBroken: ({ rule }) =>
        Effect.succeed<StayEditOutcome>(
          StayEditOutcome.cases.HardRuleBroken.make({ rule }),
        ),
    }),
  )

/**
 * The one SQLite-backed Durable Object holding all of Phillip's editable data
 * (ADR 0001). Its RPC methods run the Trip service's storage operations over
 * the object's own storage. Only plain encoded data crosses RPC: results are
 * plain structs, and typed failures become outcomes. A write moved onto
 * `write` gets its outcome derived; the rest still map theirs by hand.
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

  #run<A>(operation: Effect.Effect<A, never, Trip | SqlClient.SqlClient>) {
    if (this.#migrated === undefined || Exit.isFailure(this.#migrated)) {
      return Promise.reject(
        new Error('The Trip store refuses requests: its migrations failed.'),
      )
    }

    return runToPromise(this.#runtime, operation)
  }

  home(): Promise<HomeState> {
    return this.#run(Trip.use((trip) => trip.home))
  }

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

  /**
   * Runs the Trip write named and returns its success or typed failure as
   * plain data.
   */
  write<K extends TripWriteName>(
    name: K,
    input: TripWriteInput<K>,
  ): Promise<TripWriteOutcome<K>> {
    return this.#run(runTripWrite(name, input))
  }

  splitStay(input: SplitStay): Promise<StayEditOutcome> {
    return this.#run(
      stayEditOutcomeOf(Trip.use((trip) => trip.splitStay(input))),
    )
  }

  mergeStays(input: MergeStays): Promise<StayEditOutcome> {
    return this.#run(
      stayEditOutcomeOf(Trip.use((trip) => trip.mergeStays(input))),
    )
  }

  /**
   * Moves the date a Stay of the current Schedule checks out, with the next
   * Stay's check-in and the Move between them.
   */
  moveStayBoundary(input: MoveStayBoundary): Promise<StayEditOutcome> {
    return this.#run(
      stayEditOutcomeOf(Trip.use((trip) => trip.moveStayBoundary(input))),
    )
  }

  changeStayBase(input: ChangeStayBase): Promise<StayEditOutcome> {
    return this.#run(
      stayEditOutcomeOf(Trip.use((trip) => trip.changeStayBase(input))),
    )
  }

  checklist(): Promise<Checklist> {
    return this.#run(Trip.use((trip) => trip.checklist))
  }

  schedule(scheduleId: ScheduleId): Promise<ScheduleDetail | null> {
    return this.#run(
      Trip.use((trip) => trip.schedule(scheduleId)).pipe(
        Effect.catchTag('ScheduleNotFound', () => Effect.succeed(null)),
      ),
    )
  }

  /**
   * The current Schedule (null before Phillip chooses one), the archived
   * ones and the Trip note, from one moment.
   */
  schedules(): Promise<Schedules> {
    return this.#run(
      Trip.use((trip) => trip.schedules).pipe(
        Effect.map(({ current, ...rest }) => ({
          current: Option.getOrNull(current),
          ...rest,
        })),
      ),
    )
  }

  scheduleMap(): Promise<ScheduleMap | null> {
    return this.#run(
      Trip.use((trip) => trip.scheduleMap).pipe(Effect.map(Option.getOrNull)),
    )
  }

  scheduleSummary(): Promise<ScheduleSummary | null> {
    return this.#run(
      Trip.use((trip) => trip.scheduleSummary).pipe(
        Effect.map(Option.getOrNull),
      ),
    )
  }
}
