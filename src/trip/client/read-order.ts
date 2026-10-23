import { replaceEqualDeep } from '@tanstack/react-query'
import type { QueryState } from '@tanstack/react-query'
import { Predicate } from 'effect'

/** One read of the server: when it started, by number, and when it answered. */
export interface Read {
  readonly started: number
  readonly answeredAt: number
}

/**
 * Numbers each read as it starts, and records the read on its answer. The
 * Schedules, the Days and the Checklist store an answer only if no answer
 * from a later read is stored. Arrival order doesn't matter, so a slow read
 * never rolls back a newer one. Every Schedule snapshot that fills them uses
 * the same numbers.
 */
const reads = new WeakMap<object, Read>()

let readsStarted = 0

/** Starts a read, and returns its number. */
export const startRead = () => ++readsStarted

/** Records that `answer` came from `read`. */
export const answerOfRead = <T>(answer: T, read: Read) => {
  if (Predicate.isObject(answer)) reads.set(answer, read)

  return answer
}

/** A query function whose answers keep to the read order. */
export const readInOrder =
  <T>(read: () => Promise<T>) =>
  async () => {
    const started = startRead()
    const answer = await read()

    return answerOfRead(answer, { started, answeredAt: Date.now() })
  }

const readOf = <T>(answer: T) =>
  Predicate.isObject(answer) ? reads.get(answer) : undefined

/**
 * The cache calls this whenever it stores an answer, from a read or from a
 * snapshot. It keeps the stored answer if that answer's read started later.
 * An answer without a read number, such as one the server rendered into the
 * page, counts as the oldest when stored and the newest when arriving.
 *
 * A null answer has no read number, because a number can't be recorded on
 * null. Only a Day read answers null, and only before any Schedule exists.
 * Once Phillip has chosen a Schedule there is always a current one, so a null
 * arriving over a stored answer comes from a read that started earlier.
 */
export const keepLatestRead = <T>(stored: T | undefined, arriving: T): T => {
  const arrivingRead = readOf(arriving)

  if (stored !== undefined && stored !== null && arriving === null) {
    return stored
  }

  if (
    stored !== undefined &&
    arrivingRead !== undefined &&
    (readOf(stored)?.started ?? 0) > arrivingRead.started
  ) {
    return stored
  }

  const kept = replaceEqualDeep(stored, arriving)

  return arrivingRead === undefined ? kept : answerOfRead(kept, arrivingRead)
}

/**
 * When the server answered with the data a query holds, by `Date.now()`, or
 * undefined while it holds none. Query moves `dataUpdatedAt` on every answer,
 * even one the read order turned down, so the time comes from the read that
 * answered with the stored data. Data without a read, such as what the server
 * rendered into the page or the device kept, answered at `dataUpdatedAt`.
 */
export const answeredAt = ({ data, dataUpdatedAt }: QueryState) =>
  data === undefined ? undefined : (readOf(data)?.answeredAt ?? dataUpdatedAt)
