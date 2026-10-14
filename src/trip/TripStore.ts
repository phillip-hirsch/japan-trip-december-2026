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
  ScheduleMap,
  Schedules,
  ScheduleSummary,
  SplitStay,
  StayNotFound,
  StaysEdited,
  SetPin,
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
  SetPinOutcome,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
  WriteDayNoteOutcome,
  WriteHotelDetailsOutcome,
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
} from '@/trip/domain'
import { migrations } from '@/trip/migrations'
import { runToPromise } from '@/trip/runtime.server'
import { Trip } from '@/trip/Trip'

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

  setPin(input: SetPin): Promise<SetPinOutcome> {
    return this.#run(
      Trip.use((trip) => trip.setPin(input)).pipe(
        Effect.as<SetPinOutcome>(SetPinOutcome.cases.Set.make({})),
        Effect.catchTags({
          ScheduleChanged: () =>
            Effect.succeed<SetPinOutcome>(
              SetPinOutcome.cases.ScheduleChanged.make({}),
            ),
          ActivityNotFound: ({ activityId }) =>
            Effect.succeed<SetPinOutcome>(
              SetPinOutcome.cases.ActivityNotFound.make({ activityId }),
            ),
          StayNotFound: ({ stayId }) =>
            Effect.succeed<SetPinOutcome>(
              SetPinOutcome.cases.StayNotFound.make({ stayId }),
            ),
          LocationLinkRefused: ({ reason }) =>
            Effect.succeed<SetPinOutcome>(
              SetPinOutcome.cases.LocationLinkRefused.make({ reason }),
            ),
          CoordinatesOutsideJapan: ({ coordinates }) =>
            Effect.succeed<SetPinOutcome>(
              SetPinOutcome.cases.CoordinatesOutsideJapan.make({
                coordinates,
              }),
            ),
        }),
      ),
    )
  }

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

  checklist(): Promise<Checklist> {
    return this.#run(Trip.use((trip) => trip.checklist))
  }

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
