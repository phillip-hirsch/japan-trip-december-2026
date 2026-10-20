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
    const timer = setTimeout(() => resolve(false), workerAnswerMs)

    channel.port1.onmessage = (event: MessageEvent<boolean>) => {
      clearTimeout(timer)
      resolve(event.data === true)
    }

    worker.postMessage(question, [channel.port2])
  })
}

/**
 * A prerendered page's loader read, or, offline, the page loaded whole. An
 * in-app link runs the read over the network; when it fails because the app
 * is offline and the service worker holds the page, the page loads whole
 * instead, answered from the precache (ADR 0006). A page it doesn't hold,
 * such as `/options/9`, fails once instead of reloading into the shell
 * forever. A preload never reloads: the router follows this only on a
 * navigation.
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
