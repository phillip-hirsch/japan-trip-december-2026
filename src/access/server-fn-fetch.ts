import type { CustomFetch } from '@tanstack/react-start'

import {
  connected,
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
 * - A failed fetch that wasn't aborted means "offline".
 */
export const serverFnFetch: CustomFetch = async (url, init) => {
  const headers = new Headers(init?.headers)
  headers.set('X-Requested-With', 'XMLHttpRequest')
  let response: Response
  try {
    response = await fetch(url, { ...init, headers, redirect: 'manual' })
  } catch (error) {
    if (!init?.signal?.aborted) reportConnection(offline)
    throw error
  }
  if (response.status === 401 || response.type === 'opaqueredirect') {
    const reloading = reloadToLogIn()
    reportConnection({ _tag: 'LoginExpired', reloading })
    // Keep the current page in place until the reload replaces it.
    if (reloading) return new Promise<never>(() => {})
    throw new Error('Login expired')
  }
  reportConnection(connected)
  return response
}
