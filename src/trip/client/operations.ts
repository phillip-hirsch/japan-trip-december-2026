/**
 * One attempt at a write that the Trip replays by its id: a retry under the
 * same id returns the first result instead of writing again.
 */
export interface Operation {
  readonly id: string
  /**
   * What the attempt is for, such as the Schedule shown when it was sent, or
   * the Itinerary a replace-Schedule dialog chooses.
   */
  readonly subject: string | null
}

/**
 * The operation a send goes under: the one kept from an earlier attempt while
 * it is for the same thing, so a retry after a lost answer writes once, and
 * a new one otherwise, so it never returns another attempt's result.
 */
export const operationFor = (
  kept: Operation | undefined,
  subject: string | null,
): Operation =>
  kept !== undefined && kept.subject === subject
    ? kept
    : { id: crypto.randomUUID(), subject }
