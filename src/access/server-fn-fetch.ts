import type { CustomFetch } from '@tanstack/react-start'

import {
  connected,
  ConnectionStatus,
  currentConnection,
  offline,
  reportConnection,
} from '@/access/connection-status'

let reloadScheduled = false

// Long enough to read the banner before the page goes away.
const reloadDelayMs = 1500

// A login takes longer than this; landing back on an expired session sooner
// means the reload isn't fixing it, so stop instead of looping.
const reloadLoopWindowMs = 60_000

const lastReloadKey = 'access:login-reload-at'

const readLastReload = () => {
  try {
    return Number(sessionStorage.getItem(lastReloadKey) ?? 0)
  } catch {
    return 0
  }
}

const recordReload = (at: number) => {
  try {
    sessionStorage.setItem(lastReloadKey, String(at))

    return true
  } catch {
    // Without a record the guard can't work, so don't reload automatically.
    return false
  }
}

/**
 * Reloads the page at the top level, so Access can show its login page,
 * unless a reload just happened. Returns whether it will reload.
 */
const reloadToLogIn = () => {
  if (reloadScheduled) return true
  const now = Date.now()

  if (now - readLastReload() < reloadLoopWindowMs) return false

  if (!recordReload(now)) return false
  reloadScheduled = true
  setTimeout(() => window.location.reload(), reloadDelayMs)

  return true
}

// Soon after going offline, then once a minute.
const probeDelaysMs = [2_000, 5_000, 15_000, 30_000, 60_000]

let probing = false

/**
 * While offline, asks the app whether it is reachable again, until it
 * answers. The browser's own online state proves nothing either way: an
 * outage or captive portal can block the app while the browser stays online,
 * and ending one may never fire an `online` event. So it probes on a backoff
 * schedule, and at once on `online` or when the page becomes visible; a
 * hidden page waits until it is visible again. Only a probe's answer,
 * reported like any server function call, clears the banner.
 */
const probeUntilAnswered = () => {
  if (probing) return
  probing = true
  let attempt = 0
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    probing = false
    clearTimeout(timer)
    window.removeEventListener('online', probe)
    document.removeEventListener('visibilitychange', probeIfVisible)
  }

  const schedule = () => {
    const delay = probeDelaysMs[Math.min(attempt, probeDelaysMs.length - 1)]
    attempt += 1
    timer = setTimeout(probeIfVisible, delay)
  }

  function probe() {
    if (inFlight) return
    inFlight = true
    clearTimeout(timer)
    serverFnFetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
      .catch(() => {})
      .finally(() => {
        inFlight = false

        if (currentConnection() === offline) schedule()
        else stop()
      })
  }

  function probeIfVisible() {
    if (document.visibilityState === 'visible') probe()
  }

  window.addEventListener('online', probe)
  document.addEventListener('visibilitychange', probeIfVisible)
  schedule()
}

/** Reloads the page now, when Phillip asks to log in again. */
export const logInAgain = () => {
  recordReload(Date.now())
  window.location.reload()
}

/**
 * The browser transport for every server function call (ADR 0002).
 *
 * - `X-Requested-With` makes Access answer an expired session with 401
 *   instead of redirecting to its login page, and `redirect: 'manual'` turns
 *   any redirect that still happens into an opaque redirect rather than a
 *   CORS failure. TanStack's own redirects travel in the response body, so
 *   they are unaffected.
 * - Either answer means "login expired": the Worker never ran.
 * - A failed fetch that wasn't aborted means "offline", until a later call
 *   gets an answer.
 */
export const serverFnFetch: CustomFetch = async (url, init) => {
  const headers = new Headers(init?.headers)
  headers.set('X-Requested-With', 'XMLHttpRequest')
  let response: Response

  try {
    response = await fetch(url, { ...init, headers, redirect: 'manual' })
  } catch (error) {
    if (!init?.signal?.aborted) {
      reportConnection(offline)
      probeUntilAnswered()
    }

    throw error
  }

  if (response.status === 401 || response.type === 'opaqueredirect') {
    const reloading = reloadToLogIn()
    reportConnection(ConnectionStatus.LoginExpired({ reloading }))

    // Keep the current page in place until the reload replaces it.
    if (reloading) return new Promise<never>(() => {})
    throw new Error('Login expired')
  }

  reportConnection(connected)

  return response
}
