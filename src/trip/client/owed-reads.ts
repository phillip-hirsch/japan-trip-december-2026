import type { QueryClient } from '@tanstack/react-query'

import {
  ConnectionStatus,
  currentConnection,
  subscribeToConnection,
} from '@/access/connection-status'

/**
 * A read a save leaves owed. It stores what it reads in read order, so it can
 * run beside any other read of the same data, and resolves once it answered.
 */
type OwedRead = (queryClient: QueryClient) => Promise<void>

/** Owes the read for another save, and starts an attempt at it. */
type Owe = () => Promise<void>

const owedReads = new WeakMap<QueryClient, Map<OwedRead, Owe>>()

const isConnected = () => ConnectionStatus.$is('Connected')(currentConnection())

/** Starts owing `read` on `queryClient`, and returns how to owe it again. */
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

    // An attempt from before the latest save can't settle what it owes.
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
 * Runs `read` after a save, and again each time a request gets an answer
 * after none did, until a read started after the save answers. A read that
 * fails while the app stays connected, as on a server error, waits for the
 * next reconnect, so it never runs in a loop. Resolves once this attempt
 * answers or fails.
 */
export const readUntilAnswered = (queryClient: QueryClient, read: OwedRead) => {
  const owed = owedReads.get(queryClient) ?? new Map<OwedRead, Owe>()
  owedReads.set(queryClient, owed)

  return (owed.get(read) ?? startOwing(queryClient, read, owed))()
}
