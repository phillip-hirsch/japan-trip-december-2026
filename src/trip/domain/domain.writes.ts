import { Effect, Schema } from 'effect'

/**
 * The client-generated id of a write, recorded with its result so that a
 * retry returns that result instead of writing again.
 */
export const OperationId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand('OperationId'),
)

export type OperationId = typeof OperationId.Type

/**
 * A write named a Schedule that isn't current, or none while one is: it was
 * made on an out-of-date screen. Nothing is written.
 */
export class ScheduleChanged extends Schema.TaggedError<ScheduleChanged>()(
  'ScheduleChanged',
  {},
) {}

/** The `Schema.TaggedError` class of a Trip operation's typed failure. */
interface OperationFailure {
  readonly Type: { readonly _tag: string }
  readonly fields: Schema.Struct.Fields & {
    readonly _tag: Schema.tag<string>
  }
}

type OperationOutcomeCases<
  Success extends string,
  Fields extends Schema.Struct.Fields,
  Failures extends ReadonlyArray<OperationFailure>,
> = { readonly [K in Success]: Fields } & {
  readonly [F in Failures[number] as F['Type']['_tag']]: F['fields']
}

/** Any Trip operation's outcome, as `operationOutcome` derives it. */
export interface OperationOutcome extends Schema.Codec<
  { readonly _tag: string },
  unknown
> {
  /** The tag of the success case. */
  readonly success: string
}

/**
 * Derives a Trip operation's outcome from its success value and its failure
 * classes. The outcome has the success case, plus one case per typed failure
 * with the failure's own tag and fields, so no case is written by hand. Reads
 * that can fail, such as a Day or resolving a location link, use it too.
 */
export const operationOutcome = <
  const Success extends string,
  const Fields extends Schema.Struct.Fields,
  const Failures extends ReadonlyArray<OperationFailure>,
>(
  success: Success,
  fields: Fields,
  failures: Failures,
) =>
  Object.assign(
    Schema.TaggedUnion(
      // SAFETY: each entry pairs a case's tag with its fields, the success
      // case's as given and each failure's from its own class, which is what
      // OperationOutcomeCases spells out. Object.fromEntries loses the key types.
      Object.fromEntries([
        [success, fields],
        ...failures.map((failure) => [
          failure.fields._tag.ast.literal,
          failure.fields,
        ]),
      ]) as OperationOutcomeCases<Success, Fields, Failures>,
    ),
    { success },
  )

type SuccessOf<O extends OperationOutcome> = Omit<
  Extract<O['Type'], { readonly _tag: O['success'] }>,
  '_tag'
>

/**
 * What the operation may succeed with: the success case's fields, or nothing
 * when that case has none required.
 */
export type SuccessValueOf<O extends OperationOutcome> =
  {} extends SuccessOf<O> ? SuccessOf<O> | void : SuccessOf<O>

/**
 * Answers a Trip operation's success value or typed failure as its outcome,
 * encoded to plain data. The success value must fill the success case, and
 * each typed failure must be one of the outcome's failure cases, so a failure
 * the outcome lacks fails to compile. Server-only, like the rest of this
 * module's values.
 */
export const outcomeOf = <
  O extends OperationOutcome,
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
