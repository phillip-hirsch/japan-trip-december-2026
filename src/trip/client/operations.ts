/**
 * One attempt at a write. The Trip replays a write by its operation id, so a
 * retry under the same id returns the first result instead of writing again.
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
 * The operation for a send to `subject`. It reuses a kept operation for the
 * same subject, so a retry after a lost answer writes once. Any other send
 * gets a new id, so it never gets another attempt's result.
 */
export const operationFor = (
  kept: Operation | undefined,
  subject: string | null,
): Operation =>
  kept !== undefined && kept.subject === subject
    ? kept
    : { id: crypto.randomUUID(), subject }
