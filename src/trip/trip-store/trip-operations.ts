// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option, Schema } from 'effect'
import type { SqlClient } from 'effect/sql'

import {
  AddActivityOutcome,
  AddOwnChecklistItemOutcome,
  Checklist,
  ChooseOutcome,
  DayOutcome,
  EditActivityOutcome,
  HomeState,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  RemoveOwnChecklistItemOutcome,
  RestoreOutcome,
  ScheduleMap,
  ScheduleOutcome,
  Schedules,
  ScheduleSummary,
  SetPinOutcome,
  StayEditOutcome,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
  WriteDayNoteOutcome,
  WriteHotelDetailsOutcome,
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
  outcomeOf,
} from '@/trip/domain/domain'
import type {
  AddActivity,
  AddOwnChecklistItem,
  ChangeStayBase,
  ChooseItinerary,
  EditActivity,
  IsoDate,
  MergeStays,
  MoveActivity,
  MoveStayBoundary,
  RemoveActivity,
  RemoveOwnChecklistItem,
  RestoreSchedule,
  ScheduleId,
  SetPin,
  SplitStay,
  SuccessValueOf,
  TickChecklistItem,
  TickOwnChecklistItem,
  WriteDayNote,
  WriteHotelDetails,
  OperationOutcome,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain/domain'
import { Trip } from '@/trip/trip/Trip'

type InTripStore = Trip | SqlClient.SqlClient

/** A Trip operation the Trip store runs, with the schema of its result. */
interface TripOperation<I, S extends Schema.Codec<unknown, unknown>> {
  readonly result: S
  readonly run: (input: I) => Effect.Effect<S['Encoded'], never, InTripStore>
}

/** Pairs a Trip operation with its outcome, answered through `outcomeOf`. */
const withOutcome = <
  O extends OperationOutcome,
  I,
  A extends SuccessValueOf<O>,
  E extends O['Type'],
>(
  outcome: O,
  operation: (input: I) => Effect.Effect<A, E, InTripStore>,
): TripOperation<I, O> => ({
  result: outcome,
  run: (input) => outcomeOf(outcome, operation(input)),
})

/** Pairs a Trip read that can't fail with the schema that encodes its value. */
const read = <S extends Schema.Codec<unknown, unknown>, I = void>(
  result: S,
  operation: (input: I) => Effect.Effect<S['Type'], never, InTripStore>,
): TripOperation<I, S> => ({
  result,
  run: (input) =>
    operation(input).pipe(
      Effect.flatMap(Schema.encodeEffect(result)),
      Effect.orDie,
    ),
})

const tripOperations = {
  home: read(HomeState, () => Trip.use((trip) => trip.home)),
  day: withOutcome(DayOutcome, ({ date }: { readonly date: IsoDate }) =>
    Trip.use((trip) => trip.day(date)).pipe(
      Effect.map((page) => ({ page: Option.getOrNull(page) })),
    ),
  ),
  schedule: withOutcome(
    ScheduleOutcome,
    ({ scheduleId }: { readonly scheduleId: ScheduleId }) =>
      Trip.use((trip) => trip.schedule(scheduleId)).pipe(
        Effect.map((schedule) => ({ schedule })),
      ),
  ),
  schedules: read(Schedules, () =>
    Trip.use((trip) => trip.schedules).pipe(
      Effect.map(({ current, ...rest }) => ({
        current: Option.getOrNull(current),
        ...rest,
      })),
    ),
  ),
  scheduleMap: read(Schema.NullOr(ScheduleMap), () =>
    Trip.use((trip) => trip.scheduleMap).pipe(Effect.map(Option.getOrNull)),
  ),
  scheduleSummary: read(Schema.NullOr(ScheduleSummary), () =>
    Trip.use((trip) => trip.scheduleSummary).pipe(Effect.map(Option.getOrNull)),
  ),
  checklist: read(Checklist, () => Trip.use((trip) => trip.checklist)),
  choose: withOutcome(ChooseOutcome, (input: ChooseItinerary) =>
    Trip.use((trip) => trip.choose(input)),
  ),
  restore: withOutcome(RestoreOutcome, (input: RestoreSchedule) =>
    Trip.use((trip) => trip.restore(input)),
  ),
  writeDayNote: withOutcome(WriteDayNoteOutcome, (input: WriteDayNote) =>
    Trip.use((trip) => trip.writeDayNote(input)),
  ),
  writeStayNote: withOutcome(WriteStayNoteOutcome, (input: WriteStayNote) =>
    Trip.use((trip) => trip.writeStayNote(input)),
  ),
  writeTripNote: withOutcome(WriteTripNoteOutcome, (input: WriteTripNote) =>
    Trip.use((trip) => trip.writeTripNote(input)),
  ),
  writeHotelDetails: withOutcome(
    WriteHotelDetailsOutcome,
    (input: WriteHotelDetails) =>
      Trip.use((trip) => trip.writeHotelDetails(input)),
  ),
  splitStay: withOutcome(StayEditOutcome, (input: SplitStay) =>
    Trip.use((trip) => trip.splitStay(input)),
  ),
  mergeStays: withOutcome(StayEditOutcome, (input: MergeStays) =>
    Trip.use((trip) => trip.mergeStays(input)),
  ),
  moveStayBoundary: withOutcome(StayEditOutcome, (input: MoveStayBoundary) =>
    Trip.use((trip) => trip.moveStayBoundary(input)),
  ),
  changeStayBase: withOutcome(StayEditOutcome, (input: ChangeStayBase) =>
    Trip.use((trip) => trip.changeStayBase(input)),
  ),
  tickChecklistItem: withOutcome(
    TickChecklistItemOutcome,
    (input: TickChecklistItem) =>
      Trip.use((trip) => trip.tickChecklistItem(input)),
  ),
  tickOwnChecklistItem: withOutcome(
    TickOwnChecklistItemOutcome,
    (input: TickOwnChecklistItem) =>
      Trip.use((trip) => trip.tickOwnChecklistItem(input)),
  ),
  addOwnChecklistItem: withOutcome(
    AddOwnChecklistItemOutcome,
    (input: AddOwnChecklistItem) =>
      Trip.use((trip) => trip.addOwnChecklistItem(input)),
  ),
  removeOwnChecklistItem: withOutcome(
    RemoveOwnChecklistItemOutcome,
    (input: RemoveOwnChecklistItem) =>
      Trip.use((trip) => trip.removeOwnChecklistItem(input)),
  ),
  addActivity: withOutcome(AddActivityOutcome, (input: AddActivity) =>
    Trip.use((trip) => trip.addActivity(input)),
  ),
  editActivity: withOutcome(EditActivityOutcome, (input: EditActivity) =>
    Trip.use((trip) => trip.editActivity(input)),
  ),
  moveActivity: withOutcome(MoveActivityOutcome, (input: MoveActivity) =>
    Trip.use((trip) => trip.moveActivity(input)),
  ),
  removeActivity: withOutcome(RemoveActivityOutcome, (input: RemoveActivity) =>
    Trip.use((trip) => trip.removeActivity(input)),
  ),
  setPin: withOutcome(SetPinOutcome, (input: SetPin) =>
    Trip.use((trip) => trip.setPin(input)),
  ),
}

type TripOperations = typeof tripOperations

export type TripOperationName = keyof TripOperations

type ResultOf<K extends TripOperationName> = TripOperations[K]['result']

export type TripOperationInput<K extends TripOperationName> = Parameters<
  TripOperations[K]['run']
>[0]

/** The result of the Trip operation named, as plain data. */
export type TripOperationResult<K extends TripOperationName> =
  ResultOf<K>['Encoded']

// Indexing this mapped type with a generic name keeps the input and result
// tied to that name, which indexing tripOperations itself would not.
type OperationsByName = {
  readonly [K in TripOperationName]: TripOperation<
    TripOperationInput<K>,
    ResultOf<K>
  >
}

const operationsByName: OperationsByName = tripOperations

/** The result schema of the Trip operation named. */
export const tripOperationResult = <K extends TripOperationName>(
  name: K,
): ResultOf<K> => operationsByName[name].result

/**
 * Runs the Trip operation named and encodes its result to plain data. A typed
 * failure comes back as its outcome case. The Trip store sends the result
 * over RPC unchanged.
 */
export const runTripOperation = <K extends TripOperationName>(
  name: K,
  input: TripOperationInput<K>,
) => operationsByName[name].run(input)
