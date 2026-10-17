// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Schema } from 'effect'
import type { SqlClient } from 'effect/sql'

import { WriteDayNoteOutcome } from '@/trip/domain'
import type { WriteDayNote } from '@/trip/domain'
import { Trip } from '@/trip/Trip'

/** A write's outcome schema, as `writeOutcome` derives it. */
type Outcome = Schema.Codec<{ readonly _tag: string }, unknown> & {
  readonly success: string
}

type SuccessOf<O extends Outcome> = Omit<
  Extract<O['Type'], { readonly _tag: O['success'] }>,
  '_tag'
>

interface TripWrite<I, O extends Outcome> {
  readonly outcome: O
  readonly run: (
    input: I,
  ) => Effect.Effect<O['Encoded'], never, Trip | SqlClient.SqlClient>
}

/**
 * Pairs a Trip operation with its outcome. The operation's success value must
 * fill the success case, and each of its typed failures must be one of the
 * outcome's failure cases, so a failure the outcome lacks fails to compile.
 */
const defineTripWrite = <
  O extends Outcome,
  I,
  A extends SuccessOf<O> | void,
  E extends O['Type'],
>(
  outcome: O,
  operation: (input: I) => Effect.Effect<A, E, Trip | SqlClient.SqlClient>,
): TripWrite<I, O> => ({
  outcome,
  run: (input) =>
    operation(input).pipe(
      Effect.map((value) => ({ ...value, _tag: outcome.success })),
      Effect.catch(Effect.succeed),
      Effect.flatMap(Schema.encodeUnknownEffect(outcome)),
      Effect.orDie,
    ),
})

const tripWrites = {
  writeDayNote: defineTripWrite(WriteDayNoteOutcome, (input: WriteDayNote) =>
    Trip.use((trip) => trip.writeDayNote(input)),
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
// tied to that name, which indexing the registry itself would not.
type Writes = {
  readonly [K in TripWriteName]: TripWrite<TripWriteInput<K>, OutcomeOf<K>>
}

const writes: Writes = tripWrites

/** The outcome schema of the Trip write named. */
export const tripWriteOutcome = <K extends TripWriteName>(
  name: K,
): OutcomeOf<K> => writes[name].outcome

/**
 * Runs the Trip write named. Its success value and each of its typed failures
 * come back as its outcome, encoded to plain data, so nothing else needs
 * mapping before it crosses RPC (ADR 0001).
 */
export const runTripWrite = <K extends TripWriteName>(
  name: K,
  input: TripWriteInput<K>,
) => writes[name].run(input)
