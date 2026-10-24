import type { QueryClient } from '@tanstack/react-query'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'

/**
 * A read that a save still needs. It stores its answer in read order, so it
 * can run alongside other reads of the same data. It resolves once the server
 * answers.
 */
type OwedRead = (queryClient: QueryClient) => Promise<void>

/** Records another save that needs the read, and starts a new attempt. */
type Owe = () => Promise<void>

const owedReads = new WeakMap<QueryClient, Map<OwedRead, Owe>>()

const isConnected = () => ConnectionStatus.$is('Connected')(currentConnection())

/**
 * Starts tracking `read` on `queryClient`, and returns the function a later
 * save calls.
 */
const startOwing = (
  queryClient: QueryClient,
  read: OwedRead,
  owed: Map<OwedRead, Owe>,
) => {
  let attempts = 0
  let owedFrom = 0
  let settled = false

  const attempt = async () => {
    const number = ++attempts

    const answered = await read(queryClient).then(
      () => true,
      () => false,
    )

    // An attempt that started before the latest save doesn't count for it.
    if (!answered || settled || number < owedFrom) return
    settled = true
    stop()

    if (owed.get(read) === owe) owed.delete(read)
  }

  // A read under way may never answer, so each reconnect starts another.
  const stop = subscribeToConnection(() => {
    if (isConnected()) void attempt()
  })

  const owe: Owe = () => {
    owedFrom = attempts + 1

    return attempt()
  }

  owed.set(read, owe)

  return owe
}

/**
 * Runs `read` after a save. Each time a request gets an answer after none
 * did, it runs `read` again, until a read started after the save answers. A
 * read that fails while the app stays connected, as on a server error, waits
 * for the next reconnect, so it never runs in a loop. The returned promise
 * settles once this attempt answers or fails.
 */
export const readUntilAnswered = (queryClient: QueryClient, read: OwedRead) => {
  const owed = owedReads.get(queryClient) ?? new Map<OwedRead, Owe>()
  owedReads.set(queryClient, owed)

  return (owed.get(read) ?? startOwing(queryClient, read, owed))()
}
