import { serviceWorkerPath } from '@/offline/shell'

/**
 * Registers the service worker the production build emits (ADR 0006). Dev
 * builds have none, so they skip it.
 */
export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  navigator.serviceWorker
    .register(serviceWorkerPath, { scope: '/' })
    .catch((error: Error) =>
      console.warn('The service worker did not register', error),
    )
}
