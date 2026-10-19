import { Schema } from 'effect'

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
 * made on an out-of-date screen. Archived Schedules reject every write this
 * way, and nothing is written.
 */
export class ScheduleChanged extends Schema.TaggedError<ScheduleChanged>()(
  'ScheduleChanged',
  {},
) {}

/** The `Schema.TaggedError` class of a Trip write's typed failure. */
interface WriteFailure {
  readonly Type: { readonly _tag: string }
  readonly fields: Schema.Struct.Fields & {
    readonly _tag: Schema.tag<string>
  }
}

type WriteOutcomeCases<
  Success extends string,
  Fields extends Schema.Struct.Fields,
  Failures extends ReadonlyArray<WriteFailure>,
> = { readonly [K in Success]: Fields } & {
  readonly [F in Failures[number] as F['Type']['_tag']]: F['fields']
}

/** Any Trip write's outcome, as `writeOutcome` derives it. */
export interface WriteOutcome extends Schema.Codec<
  { readonly _tag: string },
  unknown
> {
  /** The tag of the success case. */
  readonly success: string
}

/**
 * Derives a Trip write's outcome from the write's success value and its
 * failure classes. The outcome has the success case, plus one case per typed
 * failure with the failure's own tag and fields, so no case is written by
 * hand.
 */
export const writeOutcome = <
  const Success extends string,
  const Fields extends Schema.Struct.Fields,
  const Failures extends ReadonlyArray<WriteFailure>,
>(
  success: Success,
  fields: Fields,
  failures: Failures,
) =>
  Object.assign(
    Schema.TaggedUnion(
      // SAFETY: each entry pairs a case's tag with its fields, the success
      // case's as given and each failure's from its own class, which is what
      // WriteOutcomeCases spells out. Object.fromEntries loses the key types.
      Object.fromEntries([
        [success, fields],
        ...failures.map((failure) => [
          failure.fields._tag.ast.literal,
          failure.fields,
        ]),
      ]) as WriteOutcomeCases<Success, Fields, Failures>,
    ),
    { success },
  )
