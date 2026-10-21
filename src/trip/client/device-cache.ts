import { dehydrate, hydrate } from '@tanstack/react-query'
import type { DehydratedState, Query, QueryClient } from '@tanstack/react-query'
import { get, set } from 'idb-keyval'

/**
 * The version of the data the app keeps on the device. Bump it whenever a
 * kept query's key or data changes shape: the app then discards what an
 * older version kept instead of reading it.
 */
export const keptDataVersion = '1'

/** Where IndexedDB keeps the cache. */
const storageKey = 'query-cache'

/** The cache as IndexedDB keeps it. */
interface KeptCache {
  readonly version: string
  readonly cache: DehydratedState
}

const restores = new WeakMap<QueryClient, Promise<void>>()

/**
 * While `queryClient` is restoring what the device kept, resolves once it
 * holds it. Undefined once restored, or when the cache isn't kept. A loader
 * waits for it before reading the cache.
 */
export const deviceCacheRestoring = (queryClient: QueryClient) =>
  restores.get(queryClient)

/**
 * Every query holding data, except one marked `meta: { kept: false }`. A
 * query whose last read failed, as every read does offline, still holds what
 * it read before.
 */
const kept = (query: Query) =>
  query.state.data !== undefined && query.meta?.['kept'] !== false

/**
 * The cache as the device keeps it: each kept query's data as last read,
 * without any failed read since, whose error IndexedDB may not store. Writes
 * aren't kept, because none is sent offline.
 */
const keptCache = (queryClient: QueryClient): DehydratedState => {
  const { queries } = dehydrate(queryClient, {
    shouldDehydrateQuery: kept,
    shouldDehydrateMutation: () => false,
  })

  return {
    mutations: [],
    queries: queries.map((query) => ({
      ...query,
      state: {
        ...query.state,
        status: 'success',
        error: null,
        fetchFailureReason: null,
      },
    })),
  }
}

const cacheChanges: ReadonlyArray<string> = ['added', 'removed', 'updated']

/**
 * Asks the browser to keep the app's storage under storage pressure, when it
 * would otherwise evict it. The browser decides whether to grant it.
 */
const askForPersistentStorage = async () => {
  if (!('storage' in navigator)) return

  if (!(await navigator.storage.persisted())) await navigator.storage.persist()
}

/**
 * Keeps the cache of `queryClient` in IndexedDB, so the Schedule and every
 * Day open offline after the app was closed. It first restores what the
 * device kept under `version` and discards anything else, then saves the
 * cache each time it changes. Nothing kept expires.
 */
export const keepCacheOnDevice = (
  queryClient: QueryClient,
  version = keptDataVersion,
) => {
  let saving = Promise.resolve()
  let saveQueued = false

  // One save holds every change made before it starts, so a burst of
  // changes, such as a snapshot storing every Day, is one write.
  const save = () => {
    if (saveQueued) return
    saveQueued = true

    saving = saving
      .then(() => {
        saveQueued = false
        const cache = keptCache(queryClient)

        return set(storageKey, { version, cache } satisfies KeptCache)
      })
      // A failed save, such as on a full disk, leaves the last one kept.
      .catch(() => undefined)
  }

  const restored = get<KeptCache>(storageKey)
    .then((stored) => {
      if (stored?.version === version) hydrate(queryClient, stored.cache)
    })
    // Unreadable, it counts as nothing kept, and the first save replaces it.
    .catch(() => undefined)
    .then(() => {
      restores.delete(queryClient)
      queryClient.getQueryCache().subscribe(({ type }) => {
        if (cacheChanges.includes(type)) save()
      })
      // Also keeps what arrived during the restore, such as the data the
      // server rendered into the first page.
      save()
    })

  restores.set(queryClient, restored)
  void askForPersistentStorage().catch(() => undefined)

  return {
    /** Resolves once every change made so far is on the device. */
    saved: () => restored.then(() => saving),
  }
}
