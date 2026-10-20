import { redirect } from '@tanstack/react-router'

import { ConnectionStatus, currentConnection } from '@/access/connection-status'
import type { HoldsPageQuestion } from '@/offline/shell'

const workerAnswerMs = 1000

/**
 * Whether the service worker controlling this page can answer a load of the
 * prerendered page at `href` offline, so that loading it whole brings back
 * the page with its data. No worker, or no answer in time, means no.
 */
const workerHoldsPage = (href: string) => {
  const worker =
    'serviceWorker' in navigator ? navigator.serviceWorker.controller : null

  if (worker === null) return Promise.resolve(false)

  const question: HoldsPageQuestion = {
    holdsPage: new URL(href, window.location.origin).pathname,
  }

  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()

    // The answer or the timeout, whichever comes first, closes the channel.
    // The worker holds the other port, so closing this one releases both.
    const finish = (holds: boolean) => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(holds)
    }

    const timer = setTimeout(() => finish(false), workerAnswerMs)

    channel.port1.onmessage = (event: MessageEvent<boolean>) =>
      finish(event.data === true)

    worker.postMessage(question, [channel.port2])
  })
}

/**
 * Runs a prerendered page's loader read over the network. When the read
 * fails because the app is offline and the service worker holds the page,
 * the page loads whole instead, and the worker answers from the precache
 * (ADR 0006). A page the worker doesn't hold, such as `/options/9`, fails
 * once instead of reloading into the shell forever. A preload never reloads,
 * because the router follows this redirect only on a navigation.
 */
export const readOrReloadOffline = async <A>(
  href: string,
  read: () => Promise<A>,
) => {
  try {
    return await read()
  } catch (error) {
    if (
      ConnectionStatus.$is('Offline')(currentConnection()) &&
      (await workerHoldsPage(href))
    ) {
      throw redirect({ href, reloadDocument: true })
    }

    throw error
  }
}
