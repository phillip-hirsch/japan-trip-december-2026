// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Schema } from 'effect'
import type { SqlClient } from 'effect/sql'

import {
  AddActivityOutcome,
  AddOwnChecklistItemOutcome,
  EditActivityOutcome,
  MoveActivityOutcome,
  RemoveActivityOutcome,
  RemoveOwnChecklistItemOutcome,
  SetPinOutcome,
  TickChecklistItemOutcome,
  TickOwnChecklistItemOutcome,
  WriteDayNoteOutcome,
  WriteHotelDetailsOutcome,
  WriteStayNoteOutcome,
  WriteTripNoteOutcome,
} from '@/trip/domain/domain'
import type {
  AddActivity,
  AddOwnChecklistItem,
  EditActivity,
  MoveActivity,
  RemoveActivity,
  RemoveOwnChecklistItem,
  SetPin,
  TickChecklistItem,
  TickOwnChecklistItem,
  WriteDayNote,
  WriteHotelDetails,
  WriteOutcome,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain/domain'
import { Trip } from '@/trip/trip/Trip'

type SuccessOf<O extends WriteOutcome> = Omit<
  Extract<O['Type'], { readonly _tag: O['success'] }>,
  '_tag'
>

/**
 * What the operation may succeed with: the success case's fields, or nothing
 * when that case has none required.
 */
type SuccessValueOf<O extends WriteOutcome> =
  {} extends SuccessOf<O> ? SuccessOf<O> | void : SuccessOf<O>

interface TripWrite<I, O extends WriteOutcome> {
  readonly outcome: O
  readonly run: (
    input: I,
  ) => Effect.Effect<O['Encoded'], never, Trip | SqlClient.SqlClient>
}

/**
 * Answers a Trip operation's success value or typed failure as its outcome,
 * encoded to plain data. The success value must fill the success case, and
 * each typed failure must be one of the outcome's failure cases, so a failure
 * the outcome lacks fails to compile.
 */
export const outcomeOf = <
  O extends WriteOutcome,
  A extends SuccessValueOf<O>,
  E extends O['Type'],
  R,
>(
  outcome: O,
  operation: Effect.Effect<A, E, R>,
): Effect.Effect<O['Encoded'], never, R> =>
  operation.pipe(
    Effect.map((value) => ({ ...value, _tag: outcome.success })),
    Effect.catch(Effect.succeed),
    Effect.flatMap(Schema.encodeUnknownEffect(outcome)),
    Effect.orDie,
  )

/** Pairs a Trip operation with its outcome, answered through `outcomeOf`. */
const defineTripWrite = <
  O extends WriteOutcome,
  I,
  A extends SuccessValueOf<O>,
  E extends O['Type'],
>(
  outcome: O,
  operation: (input: I) => Effect.Effect<A, E, Trip | SqlClient.SqlClient>,
): TripWrite<I, O> => ({
  outcome,
  run: (input) => outcomeOf(outcome, operation(input)),
})

const tripWrites = {
  writeDayNote: defineTripWrite(WriteDayNoteOutcome, (input: WriteDayNote) =>
    Trip.use((trip) => trip.writeDayNote(input)),
  ),
  writeStayNote: defineTripWrite(WriteStayNoteOutcome, (input: WriteStayNote) =>
    Trip.use((trip) => trip.writeStayNote(input)),
  ),
  writeTripNote: defineTripWrite(WriteTripNoteOutcome, (input: WriteTripNote) =>
    Trip.use((trip) => trip.writeTripNote(input)),
  ),
  writeHotelDetails: defineTripWrite(
    WriteHotelDetailsOutcome,
    (input: WriteHotelDetails) =>
      Trip.use((trip) => trip.writeHotelDetails(input)),
  ),
  tickChecklistItem: defineTripWrite(
    TickChecklistItemOutcome,
    (input: TickChecklistItem) =>
      Trip.use((trip) => trip.tickChecklistItem(input)),
  ),
  tickOwnChecklistItem: defineTripWrite(
    TickOwnChecklistItemOutcome,
    (input: TickOwnChecklistItem) =>
      Trip.use((trip) => trip.tickOwnChecklistItem(input)),
  ),
  addOwnChecklistItem: defineTripWrite(
    AddOwnChecklistItemOutcome,
    (input: AddOwnChecklistItem) =>
      Trip.use((trip) => trip.addOwnChecklistItem(input)),
  ),
  removeOwnChecklistItem: defineTripWrite(
    RemoveOwnChecklistItemOutcome,
    (input: RemoveOwnChecklistItem) =>
      Trip.use((trip) => trip.removeOwnChecklistItem(input)),
  ),
  addActivity: defineTripWrite(AddActivityOutcome, (input: AddActivity) =>
    Trip.use((trip) => trip.addActivity(input)),
  ),
  editActivity: defineTripWrite(EditActivityOutcome, (input: EditActivity) =>
    Trip.use((trip) => trip.editActivity(input)),
  ),
  moveActivity: defineTripWrite(MoveActivityOutcome, (input: MoveActivity) =>
    Trip.use((trip) => trip.moveActivity(input)),
  ),
  removeActivity: defineTripWrite(
    RemoveActivityOutcome,
    (input: RemoveActivity) => Trip.use((trip) => trip.removeActivity(input)),
  ),
  setPin: defineTripWrite(SetPinOutcome, (input: SetPin) =>
    Trip.use((trip) => trip.setPin(input)),
  ),
}

type TripWrites = typeof tripWrites

export type TripWriteName = keyof TripWrites

type OutcomeOf<K extends TripWriteName> = TripWrites[K]['outcome']

export type TripWriteInput<K extends TripWriteName> = Parameters<
  TripWrites[K]['run']
>[0]

/** The outcome of the Trip write named, as plain data. */
export type TripWriteOutcome<K extends TripWriteName> = OutcomeOf<K>['Encoded']

// Indexing this mapped type with a generic name keeps the input and outcome
// tied to that name, which indexing tripWrites itself would not.
type WritesByName = {
  readonly [K in TripWriteName]: TripWrite<TripWriteInput<K>, OutcomeOf<K>>
}

const writesByName: WritesByName = tripWrites

/** The outcome schema of the Trip write named. */
export const tripWriteOutcome = <K extends TripWriteName>(
  name: K,
): OutcomeOf<K> => writesByName[name].outcome

/**
 * Runs the Trip write named. Its success value and each of its typed failures
 * come back as its outcome, encoded to plain data, so the Trip store can
 * answer it over RPC as it is.
 */
export const runTripWrite = <K extends TripWriteName>(
  name: K,
  input: TripWriteInput<K>,
) => writesByName[name].run(input)
