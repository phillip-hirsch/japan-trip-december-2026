// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-do'
import { DurableObject } from 'cloudflare:workers'
import { Effect, Exit, Layer, ManagedRuntime, Option } from 'effect'
import type { SqlClient } from 'effect/sql'

import type {
  AddActivity,
  AddOwnChecklistItem,
  ChangeStayBase,
  Checklist,
  ChooseItinerary,
  EditActivity,
  HardRuleBroken,
  HomeState,
  IsoDate,
  MergeStays,
  MoveActivity,
  MoveStayBoundary,
  RestoreSchedule,
  ScheduleChanged,
  ScheduleDetail,
  ScheduleId,
  Schedules,
  ScheduleSummary,
  SplitStay,
  StayNotFound,
  StaysEdited,
  RemoveActivity,
  RemoveOwnChecklistItem,
  TickChecklistItem,
  TickOwnChecklistItem,
  WriteDayNote,
  WriteHotelDetails,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain'
import {
  AddActivityOutcome,
  AddOwnChecklistItemOutcome,
  ChooseOutcome,
  DayOutcome,
  EditActivityOutcome,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  RemoveOwnChecklistItemOutcome,
  RestoreOutcome,
  StayEditOutcome,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
  WriteDayNoteOutcome,
  WriteHotelDetailsOutcome,
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
} from '@/trip/domain'
import { Itineraries } from '@/trip/Itineraries'
import { migrations } from '@/trip/migrations'
import { runToPromise } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'

/**
 * Turns a Stay edit's result or refusal into its outcome. Every Stay edit's
 * RPC method uses it, so all Stay edits answer in the same shape.
 */
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
          NoteTooLong: ({ maxLength }) =>
            Effect.succeed<WriteDayNoteOutcome>(
              WriteDayNoteOutcome.cases.NoteTooLong.make({ maxLength }),
            ),
        }),
      ),
    )
  }

  /** Writes the Stay note on a Stay of the current Schedule, as a whole. */
  writeStayNote(input: WriteStayNote): Promise<WriteStayNoteOutcome> {
    return this.#run(
      Trip.use((trip) => trip.writeStayNote(input)).pipe(
        Effect.as<WriteStayNoteOutcome>(
          WriteStayNoteOutcome.cases.Written.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<WriteStayNoteOutcome>(
              WriteStayNoteOutcome.cases.ScheduleChanged.make({}),
            ),
          StayNotFound: ({ stayId }) =>
            Effect.succeed<WriteStayNoteOutcome>(
              WriteStayNoteOutcome.cases.StayNotFound.make({ stayId }),
            ),
          NoteTooLong: ({ maxLength }) =>
            Effect.succeed<WriteStayNoteOutcome>(
              WriteStayNoteOutcome.cases.NoteTooLong.make({ maxLength }),
            ),
        }),
      ),
    )
  }

  /** Writes the Hotel details on a Stay of the current Schedule, as a whole. */
  writeHotelDetails(
    input: WriteHotelDetails,
  ): Promise<WriteHotelDetailsOutcome> {
    return this.#run(
      Trip.use((trip) => trip.writeHotelDetails(input)).pipe(
        Effect.as<WriteHotelDetailsOutcome>(
          WriteHotelDetailsOutcome.cases.Written.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<WriteHotelDetailsOutcome>(
              WriteHotelDetailsOutcome.cases.ScheduleChanged.make({}),
            ),
          StayNotFound: ({ stayId }) =>
            Effect.succeed<WriteHotelDetailsOutcome>(
              WriteHotelDetailsOutcome.cases.StayNotFound.make({ stayId }),
            ),
          HotelDetailTooLong: ({ maxLength }) =>
            Effect.succeed<WriteHotelDetailsOutcome>(
              WriteHotelDetailsOutcome.cases.HotelDetailTooLong.make({
                maxLength,
              }),
            ),
        }),
      ),
    )
  }

  /** Splits a Stay of the current Schedule at a date inside it. */
  splitStay(input: SplitStay): Promise<StayEditOutcome> {
    return this.#run(
      stayEditOutcomeOf(Trip.use((trip) => trip.splitStay(input))),
    )
  }

  /** Merges two adjacent Stays in one Base of the current Schedule. */
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

  /** Changes the Base of a Stay of the current Schedule. */
  changeStayBase(input: ChangeStayBase): Promise<StayEditOutcome> {
    return this.#run(
      stayEditOutcomeOf(Trip.use((trip) => trip.changeStayBase(input))),
    )
  }

  /** Writes the Trip note, as a whole. */
  writeTripNote(input: WriteTripNote): Promise<WriteTripNoteOutcome> {
    return this.#run(
      Trip.use((trip) => trip.writeTripNote(input)).pipe(
        Effect.as<WriteTripNoteOutcome>(
          WriteTripNoteOutcome.cases.Written.make({}),
        ),
        Effect.catchTag('NoteTooLong', ({ maxLength }) =>
          Effect.succeed<WriteTripNoteOutcome>(
            WriteTripNoteOutcome.cases.NoteTooLong.make({ maxLength }),
          ),
        ),
      ),
    )
  }

  /** The Checklist, from the current Schedule as it is now. */
  checklist(): Promise<Checklist> {
    return this.#run(Trip.use((trip) => trip.checklist))
  }

  /** Sets the tick on an item derived from the current Schedule. */
  tickChecklistItem(
    input: TickChecklistItem,
  ): Promise<TickChecklistItemOutcome> {
    return this.#run(
      Trip.use((trip) => trip.tickChecklistItem(input)).pipe(
        Effect.as<TickChecklistItemOutcome>(
          TickChecklistItemOutcome.cases.Ticked.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<TickChecklistItemOutcome>(
              TickChecklistItemOutcome.cases.ScheduleChanged.make({}),
            ),
          ChecklistItemNotFound: ({ itemId }) =>
            Effect.succeed<TickChecklistItemOutcome>(
              TickChecklistItemOutcome.cases.ChecklistItemNotFound.make({
                itemId,
              }),
            ),
        }),
      ),
    )
  }

  /** Adds one of Phillip's own Checklist items. */
  addOwnChecklistItem(
    input: AddOwnChecklistItem,
  ): Promise<AddOwnChecklistItemOutcome> {
    return this.#run(
      Trip.use((trip) => trip.addOwnChecklistItem(input)).pipe(
        Effect.map((added): AddOwnChecklistItemOutcome =>
          AddOwnChecklistItemOutcome.cases.Added.make(added),
        ),
        Effect.catchTag('ChecklistTextInvalid', ({ maxLength }) =>
          Effect.succeed<AddOwnChecklistItemOutcome>(
            AddOwnChecklistItemOutcome.cases.ChecklistTextInvalid.make({
              maxLength,
            }),
          ),
        ),
      ),
    )
  }

  /** Sets the tick on one of Phillip's own Checklist items. */
  tickOwnChecklistItem(
    input: TickOwnChecklistItem,
  ): Promise<TickOwnChecklistItemOutcome> {
    return this.#run(
      Trip.use((trip) => trip.tickOwnChecklistItem(input)).pipe(
        Effect.as<TickOwnChecklistItemOutcome>(
          TickOwnChecklistItemOutcome.cases.Ticked.make({}),
        ),
        Effect.catchTag('ChecklistItemNotFound', ({ itemId }) =>
          Effect.succeed<TickOwnChecklistItemOutcome>(
            TickOwnChecklistItemOutcome.cases.ChecklistItemNotFound.make({
              itemId,
            }),
          ),
        ),
      ),
    )
  }

  /** Removes one of Phillip's own Checklist items. */
  removeOwnChecklistItem(
    input: RemoveOwnChecklistItem,
  ): Promise<RemoveOwnChecklistItemOutcome> {
    return this.#run(
      Trip.use((trip) => trip.removeOwnChecklistItem(input)).pipe(
        Effect.as<RemoveOwnChecklistItemOutcome>(
          RemoveOwnChecklistItemOutcome.cases.Removed.make({}),
        ),
      ),
    )
  }

  /** Adds an Activity on a Day of the current Schedule. */
  addActivity(input: AddActivity): Promise<AddActivityOutcome> {
    return this.#run(
      Trip.use((trip) => trip.addActivity(input)).pipe(
        Effect.map((added): AddActivityOutcome =>
          AddActivityOutcome.cases.Added.make(added),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<AddActivityOutcome>(
              AddActivityOutcome.cases.ScheduleChanged.make({}),
            ),
          DayNotFound: ({ date }) =>
            Effect.succeed<AddActivityOutcome>(
              AddActivityOutcome.cases.DayNotFound.make({ date }),
            ),
          ActivityTitleInvalid: ({ maxLength }) =>
            Effect.succeed<AddActivityOutcome>(
              AddActivityOutcome.cases.ActivityTitleInvalid.make({ maxLength }),
            ),
          NoteTooLong: ({ maxLength }) =>
            Effect.succeed<AddActivityOutcome>(
              AddActivityOutcome.cases.NoteTooLong.make({ maxLength }),
            ),
        }),
      ),
    )
  }

  /** Writes the fields an edit carries on an Activity of the current Schedule. */
  editActivity(input: EditActivity): Promise<EditActivityOutcome> {
    return this.#run(
      Trip.use((trip) => trip.editActivity(input)).pipe(
        Effect.as<EditActivityOutcome>(
          EditActivityOutcome.cases.Edited.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<EditActivityOutcome>(
              EditActivityOutcome.cases.ScheduleChanged.make({}),
            ),
          ActivityNotFound: ({ activityId }) =>
            Effect.succeed<EditActivityOutcome>(
              EditActivityOutcome.cases.ActivityNotFound.make({ activityId }),
            ),
          ActivityTitleInvalid: ({ maxLength }) =>
            Effect.succeed<EditActivityOutcome>(
              EditActivityOutcome.cases.ActivityTitleInvalid.make({
                maxLength,
              }),
            ),
          NoteTooLong: ({ maxLength }) =>
            Effect.succeed<EditActivityOutcome>(
              EditActivityOutcome.cases.NoteTooLong.make({ maxLength }),
            ),
        }),
      ),
    )
  }

  /** Removes an Activity of the current Schedule. */
  removeActivity(input: RemoveActivity): Promise<RemoveActivityOutcome> {
    return this.#run(
      Trip.use((trip) => trip.removeActivity(input)).pipe(
        Effect.as<RemoveActivityOutcome>(
          RemoveActivityOutcome.cases.Removed.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<RemoveActivityOutcome>(
              RemoveActivityOutcome.cases.ScheduleChanged.make({}),
            ),
          ActivityNotFound: ({ activityId }) =>
            Effect.succeed<RemoveActivityOutcome>(
              RemoveActivityOutcome.cases.ActivityNotFound.make({ activityId }),
            ),
        }),
      ),
    )
  }

  /** Moves an Activity of the current Schedule within its Day. */
  moveActivity(input: MoveActivity): Promise<MoveActivityOutcome> {
    return this.#run(
      Trip.use((trip) => trip.moveActivity(input)).pipe(
        Effect.as<MoveActivityOutcome>(
          MoveActivityOutcome.cases.Moved.make({}),
        ),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<MoveActivityOutcome>(
              MoveActivityOutcome.cases.ScheduleChanged.make({}),
            ),
          ActivityNotFound: ({ activityId }) =>
            Effect.succeed<MoveActivityOutcome>(
              MoveActivityOutcome.cases.ActivityNotFound.make({ activityId }),
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

  /** The current Schedule's summary, or null before Phillip chooses one. */
  scheduleSummary(): Promise<ScheduleSummary | null> {
    return this.#run(
      Trip.use((trip) => trip.scheduleSummary).pipe(
        Effect.map(Option.getOrNull),
      ),
    )
  }
}
