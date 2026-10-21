import { dehydrate, hydrate } from '@tanstack/react-query'
import type {
  DehydratedState,
  Query,
  QueryCacheNotifyEvent,
  QueryClient,
} from '@tanstack/react-query'
import { createStore, get, update } from 'idb-keyval'
import type { UseStore } from 'idb-keyval'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** False for a query the device never keeps. */
      readonly kept?: boolean
    }
  }
}

/**
 * The version of the data the app keeps on the device. Bump it whenever a
 * kept query's key or data changes shape: the app then discards what an
 * older version kept instead of reading it.
 */
export const keptDataVersion = 1

/** Where IndexedDB keeps the cache. */
const storageKey = 'query-cache'

let database: UseStore | undefined

/**
 * The IndexedDB store, opened on first use. A browser that refuses
 * IndexedDB throws here, so the next use tries again.
 */
const keptStore = () => (database ??= createStore('keyval-store', 'keyval'))

/**
 * How long a loader waits for the restore. Reading IndexedDB takes
 * milliseconds, and one that hasn't answered in time may never answer.
 * Online the network can answer instead, so a loader waits briefly. Offline
 * only the restore can, so it waits longer.
 */
const restoreWaitMs = { online: 3000, offline: 30_000 }

/** The cache as IndexedDB keeps it. */
interface KeptCache {
  readonly version: number
  readonly cache: DehydratedState
}

type KeptQuery = DehydratedState['queries'][number]

const restores = new WeakMap<QueryClient, Promise<void>>()

/** Resolves once `done` does, or after `ms`, whichever comes first. */
const within = (done: Promise<void>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)

    void done.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * While `queryClient` is restoring what the device kept, resolves once it
 * holds it, or once a loader has waited long enough, `offline` or not.
 * Undefined once restored, or when the cache isn't kept. A loader waits for
 * it before reading the cache.
 */
export const deviceCacheRestoring = (
  queryClient: QueryClient,
  offline: boolean,
) => {
  const restoring = restores.get(queryClient)

  return (
    restoring &&
    within(restoring, offline ? restoreWaitMs.offline : restoreWaitMs.online)
  )
}

/**
 * Every query holding data, except one marked `meta: { kept: false }`. A
 * query whose last read failed, as every read does offline, still holds what
 * it read before.
 */
const isKept = (query: Query) =>
  query.state.data !== undefined && query.meta?.kept !== false

/**
 * Each kept query's data as last read, without any failed read since, whose
 * error IndexedDB may not store. Writes aren't kept, because none is sent
 * offline.
 */
const keptQueries = (queryClient: QueryClient): ReadonlyArray<KeptQuery> =>
  dehydrate(queryClient, {
    shouldDehydrateQuery: isKept,
    shouldDehydrateMutation: () => false,
  }).queries.map((query) => ({
    ...query,
    state: {
      ...query.state,
      status: 'success',
      error: null,
      fetchFailureReason: null,
    },
  }))

/** Whether `event` gives a query data: a read, a write or a restore. */
const storesData = (event: QueryCacheNotifyEvent) =>
  event.type === 'added' ||
  (event.type === 'updated' &&
    (event.action.type === 'success' || event.action.type === 'setState'))

/**
 * What the device keeps after this app saves `queries` over `stored`, which
 * another tab may have saved since. A newer version's data stays as it is,
 * and an older version's is discarded. Otherwise the app writes the queries
 * it `changed` since its last save, and the rest only where the device
 * keeps nothing for them, so it never undoes another tab's newer save.
 */
const savedOver = (
  stored: KeptCache | undefined,
  version: number,
  queries: ReadonlyArray<KeptQuery>,
  changed: ReadonlySet<string>,
): KeptCache => {
  if (stored !== undefined && stored.version > version) return stored

  const merged = new Map<string, KeptQuery>(
    stored?.version === version
      ? stored.cache.queries.map((query) => [query.queryHash, query])
      : [],
  )

  for (const query of queries) {
    if (changed.has(query.queryHash) || !merged.has(query.queryHash)) {
      merged.set(query.queryHash, query)
    }
  }

  return { version, cache: { mutations: [], queries: [...merged.values()] } }
}

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
 * device kept under `version`, then saves what changes. Nothing kept
 * expires. Without IndexedDB, the app works as it would online.
 */
export const keepCacheOnDevice = (
  queryClient: QueryClient,
  version = keptDataVersion,
) => {
  let saving = Promise.resolve()
  let saveQueued = false
  // The queries this app gave data since its last save.
  let changed = new Set<string>()

  // One save holds every change made before it starts, so a burst of
  // changes, such as a snapshot storing every Day, is one write.
  const save = () => {
    if (saveQueued) return
    saveQueued = true

    saving = saving.then(async () => {
      saveQueued = false
      const written = changed
      changed = new Set()

      try {
        const queries = keptQueries(queryClient)

        await update<KeptCache>(
          storageKey,
          (stored) => savedOver(stored, version, queries, written),
          keptStore(),
        )
      } catch {
        // A failed save, such as on a full disk, leaves the last one kept,
        // and the next save writes these changes too.
        for (const queryHash of written) changed.add(queryHash)
      }
    })
  }

  // What the app holds when the restore ends, such as the data the server
  // rendered into the page, is newer than anything kept, whichever clock
  // dated each. So the restore fills only queries without data, and the
  // first save writes the rest over what the device keeps.
  const markHeld = () => {
    for (const query of queryClient.getQueryCache().getAll()) {
      if (isKept(query)) changed.add(query.queryHash)
    }
  }

  // Started in a callback, so a browser that refuses IndexedDB outright
  // fails the restore instead of the app.
  const restored = Promise.resolve()
    .then(() => get<KeptCache>(storageKey, keptStore()))
    .then((stored) => {
      markHeld()

      if (stored?.version !== version) return

      hydrate(queryClient, {
        queries: stored.cache.queries.filter(
          (query) => queryClient.getQueryData(query.queryKey) === undefined,
        ),
      })
    })
    // Unreadable, it counts as nothing kept.
    .catch(markHeld)
    .then(() => {
      queryClient.getQueryCache().subscribe((event) => {
        if (!storesData(event)) return

        changed.add(event.query.queryHash)
        save()
      })
      save()
    })

  restores.set(queryClient, restored)
  void restored.then(() => restores.delete(queryClient))
  void askForPersistentStorage().catch(() => undefined)

  return {
    /** Resolves once every change made so far is on the device. */
    saved: () => restored.then(() => saving),
  }
}
