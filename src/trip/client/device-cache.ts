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
 * kept query's key or data changes shape. The app then discards what an
 * older version kept instead of reading it.
 */
export const keptDataVersion = 1

/** Where IndexedDB keeps the cache. */
const storageKey = 'query-cache'

let database: UseStore | undefined

/**
 * The IndexedDB store, which the app opens on first use. A browser that
 * refuses IndexedDB throws here, so the next use tries again.
 */
const keptStore = () => (database ??= createStore('keyval-store', 'keyval'))

/**
 * How long after the restore starts loaders stop waiting for it. Reading
 * IndexedDB takes milliseconds, and a read that hasn't answered by then may
 * never answer. Online the network can answer instead, so loaders wait
 * briefly. Offline only the restore can, so they wait longer.
 */
const restoreWaitMs = { online: 3000, offline: 30_000 }

/** The cache as IndexedDB keeps it. */
interface KeptCache {
  readonly version: number
  readonly cache: DehydratedState
}

type KeptQuery = DehydratedState['queries'][number]

interface Restore {
  readonly restored: Promise<void>
  /** When it started, by `performance.now()`. */
  readonly startedAt: number
}

const restores = new WeakMap<QueryClient, Restore>()

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
 * While `queryClient` restores what the device kept, a promise that resolves
 * when the restore ends or when loaders stop waiting for it, whichever comes
 * first. `offline` picks the later time to stop. Undefined after either, or
 * when the app doesn't keep this cache. A loader waits for it before it reads
 * the cache.
 */
export const deviceCacheRestoring = (
  queryClient: QueryClient,
  offline: boolean,
) => {
  const restore = restores.get(queryClient)

  if (restore === undefined) return undefined

  const wait = offline ? restoreWaitMs.offline : restoreWaitMs.online
  const left = restore.startedAt + wait - performance.now()

  return left > 0 ? within(restore.restored, left) : undefined
}

/**
 * Every query holding data, except one marked `meta: { kept: false }`. A
 * query whose last read failed, as every read does offline, still holds what
 * it read before.
 */
const isKept = (query: Query) =>
  query.state.data !== undefined && query.meta?.kept !== false

/**
 * Each kept query's data as last read. It leaves out any failed read since
 * then, because IndexedDB may refuse to store its error. The device keeps no
 * writes, because the app sends none offline.
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

/**
 * What the device keeps after this app saves `queries` over `stored`.
 * Another tab may have saved `stored` since this app last read it.
 *
 * The app leaves a newer version's data as it is and discards an older
 * version's. Otherwise it writes the queries it `changed` since its last
 * save, and the others only where the device keeps nothing for them. So it
 * never undoes another tab's newer save.
 *
 * When two tabs read the same query from the network at about the same
 * time, such as one opening while the other saves, the device keeps the copy
 * saved last. The next read of that query replaces it.
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
 * expires. Without IndexedDB, the app works as it would online. Call it on
 * a new cache, before the app stores anything in it.
 */
export const keepCacheOnDevice = (
  queryClient: QueryClient,
  version = keptDataVersion,
) => {
  // The queries this app gave new data since its last save.
  let changed = new Set<string>()
  // The data each query held when last noted. An answer that leaves the data
  // as it was, such as a read the read order turned down, is no change.
  const noted = new Map<string, unknown>()
  let restoring = false
  let saveQueued = false

  // The restore starts in a callback, so a browser that refuses IndexedDB
  // outright fails the restore instead of the app.
  const restored = Promise.resolve()
    .then(() => get<KeptCache>(storageKey, keptStore()))
    .then((stored) => {
      if (stored?.version !== version) return

      // What the app read before the restore ended, such as the data the
      // server rendered into the page, is newer than anything kept, so the
      // restore fills only queries without data.
      restoring = true

      try {
        hydrate(queryClient, {
          queries: stored.cache.queries.filter(
            (query) => queryClient.getQueryData(query.queryKey) === undefined,
          ),
        })
      } finally {
        restoring = false
      }
    })
    // If IndexedDB can't read what the device kept, the app treats it as
    // nothing kept.
    .catch(() => undefined)

  // Saves start once the restore ends, so the first one merges with what the
  // device kept instead of replacing it.
  let saving = restored

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

  // Notes every query given new data from the start, so nothing read while
  // the restore runs goes unsaved. What the restore itself puts back is
  // already on the device. Any read also retries changes a failed save left
  // unwritten, even when it finds the data unchanged.
  const noteNewData = ({ type, query }: QueryCacheNotifyEvent) => {
    if (type !== 'added' && type !== 'updated') return

    const { data } = query.state

    if (data !== undefined && noted.get(query.queryHash) !== data) {
      noted.set(query.queryHash, data)

      if (!restoring) changed.add(query.queryHash)
    }

    if (changed.size > 0) save()
  }

  queryClient.getQueryCache().subscribe(noteNewData)
  // Also writes what the device keeps nothing for, such as after a new
  // version discarded what an older one kept.
  save()

  restores.set(queryClient, { restored, startedAt: performance.now() })
  void restored.then(() => restores.delete(queryClient))
  void askForPersistentStorage().catch(() => undefined)

  return {
    /** Resolves once every change made so far is on the device. */
    saved: () => saving,
  }
}
