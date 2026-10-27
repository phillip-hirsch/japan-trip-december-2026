// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option } from 'effect'
import type { Schema } from 'effect'

import {
  ActivityTitleInvalid,
  ChecklistTextInvalid,
  NoteTooLong,
  StayNotFound,
} from '@/trip/domain/domain'
import type { OperationId, ScheduleId } from '@/trip/domain/domain'
import {
  activityTitleMaxLength,
  checklistTextMaxLength,
  noteMaxLength,
} from '@/trip/domain/limits'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import type { ScheduleStore } from '@/trip/schedule-store/schedule-store'

/**
 * How a write that takes an operation id records its result: under that id,
 * stored with the result's schema. Each such write declares it once.
 */
interface Recorded<A> {
  readonly operationId: OperationId
  readonly result: Schema.Codec<A, unknown>
}

type Write<A, E, R> = (store: ScheduleStore) => Effect.Effect<A, E, R>

/** The Schedule `found`, which store start always creates. */
const theSchedule = <A>(found: Option.Option<A>) =>
  Option.match(found, {
    onNone: () => Effect.die(new Error('The store has no Schedule')),
    onSome: Effect.succeed,
  })

const storeWrite = Effect.fnUntraced(
  function* <A, E, R>(
    recorded: Recorded<A> | undefined,
    write: Write<A, E, R>,
  ) {
    const store = yield* scheduleStore

    return yield* store.transaction(
      Effect.gen(function* () {
        if (recorded !== undefined) {
          const replayed = yield* store.recordedResult(recorded.result)(
            recorded.operationId,
          )

          if (Option.isSome(replayed)) return replayed.value.result
        }

        const result = yield* write(store)

        if (recorded !== undefined) {
          yield* store.recordResult(recorded.result)({
            id: recorded.operationId,
            result,
          })
        }

        return result
      }),
    )
  },
  Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
)

/**
 * The one way the Trip service writes to the Schedule. In one transaction, it:
 *
 * 1. returns the recorded result when the operation id repeats,
 * 2. otherwise runs the write on the Schedule's id, and
 * 3. records the result with its operation id.
 *
 * `recorded` is there only for a write that takes an operation id. Storage
 * failures become defects. A write checks its request on its own before
 * calling this, so bad input is refused as such. A lookup in the store or
 * the catalogue belongs to the write, after replay, so a retry still returns
 * its first result.
 */
export const scheduleWrite = <A, E, R>(
  { recorded }: { readonly recorded?: Recorded<A> },
  write: (
    store: ScheduleStore,
    scheduleId: ScheduleId,
  ) => Effect.Effect<A, E, R>,
) =>
  storeWrite(recorded, (store) =>
    Effect.flatMap(Effect.flatMap(store.currentRecord, theSchedule), ({ id }) =>
      write(store, id),
    ),
  )

/**
 * The same for a write to the Trip itself, such as the Trip note or an own
 * Checklist item, which belongs to no Schedule.
 */
export const tripWrite = <A, E, R>(
  { recorded }: { readonly recorded?: Recorded<A> },
  write: Write<A, E, R>,
) => storeWrite(recorded, write)

/** The Schedule, with its copy. Store start creates it, so it is always there. */
export const currentIn = (store: ScheduleStore) =>
  Effect.flatMap(store.current, theSchedule)

export const requireStay = Effect.fnUntraced(function* (
  store: ScheduleStore,
  scheduleId: ScheduleId,
  stayId: string,
) {
  if (!(yield* store.hasStay(scheduleId, stayId))) {
    return yield* new StayNotFound({ stayId })
  }
})

export const requireNoteLength = (note: string) =>
  note.length > noteMaxLength
    ? Effect.fail(new NoteTooLong({ maxLength: noteMaxLength }))
    : Effect.void

const requireText = <E>(
  text: string,
  maxLength: number,
  invalid: (maxLength: number) => E,
) => {
  const trimmed = text.trim()

  return trimmed === '' || trimmed.length > maxLength
    ? Effect.fail(invalid(maxLength))
    : Effect.succeed(trimmed)
}

export const requireChecklistText = (text: string) =>
  requireText(
    text,
    checklistTextMaxLength,
    (maxLength) => new ChecklistTextInvalid({ maxLength }),
  )

export const requireActivityTitle = (title: string) =>
  requireText(
    title,
    activityTitleMaxLength,
    (maxLength) => new ActivityTitleInvalid({ maxLength }),
  )
