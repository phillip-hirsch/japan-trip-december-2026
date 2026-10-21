import { dehydrate, hydrate } from '@tanstack/react-query'
import type {
  DehydratedState,
  Query,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query'
import { get, update } from 'idb-keyval'

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

/**
 * How long a loader waits for the restore. Reading IndexedDB takes
 * milliseconds; one that hasn't answered by then may never answer.
 */
const restoreWaitMs = 3000

/** The cache as IndexedDB keeps it. */
interface KeptCache {
  readonly version: number
  readonly cache: DehydratedState
}

type KeptQuery = DehydratedState['queries'][number]

const restores = new WeakMap<QueryClient, Promise<void>>()

/**
 * While `queryClient` is restoring what the device kept, resolves once it
 * holds it, or after `restoreWaitMs`. Undefined after that, or when the
 * cache isn't kept. A loader waits for it before reading the cache.
 */
export const deviceCacheRestoring = (queryClient: QueryClient) =>
  restores.get(queryClient)

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

/**
 * What the device keeps after this app saves `queries` over `stored`, which
 * another tab may have saved since. A newer version's data stays as it is,
 * and an older version's is discarded. Otherwise each query keeps whichever
 * copy was stored last.
 */
const savedOver = (
  stored: KeptCache | undefined,
  version: number,
  queries: ReadonlyArray<KeptQuery>,
): KeptCache => {
  if (stored !== undefined && stored.version > version) return stored

  const merged = new Map<string, KeptQuery>(
    stored?.version === version
      ? stored.cache.queries.map((query) => [query.queryHash, query])
      : [],
  )

  for (const query of queries) {
    const other = merged.get(query.queryHash)

    if (
      other === undefined ||
      other.state.dataUpdatedAt <= query.state.dataUpdatedAt
    ) {
      merged.set(query.queryHash, query)
    }
  }

  return { version, cache: { mutations: [], queries: [...merged.values()] } }
}

const holdsData = (queryClient: QueryClient, queryKey: QueryKey) =>
  queryClient.getQueryData(queryKey) !== undefined

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
 * device kept under `version`, then saves the cache each time it changes.
 * Nothing kept expires. Without IndexedDB, the app works as it would online.
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
        const queries = keptQueries(queryClient)

        return update<KeptCache>(storageKey, (stored) =>
          savedOver(stored, version, queries),
        )
      })
      // A failed save, such as on a full disk, leaves the last one kept.
      .catch(() => undefined)
  }

  // Started in a callback, so a browser that refuses IndexedDB outright
  // fails the restore instead of the app.
  const restored = Promise.resolve()
    .then(() => get<KeptCache>(storageKey))
    .then((stored) => {
      if (stored?.version !== version) return

      // Data read since the app opened is newer, whichever clock dated it,
      // such as the data the server rendered into the page.
      hydrate(queryClient, {
        queries: stored.cache.queries.filter(
          (query) => !holdsData(queryClient, query.queryKey),
        ),
      })
    })
    // Unreadable, it counts as nothing kept.
    .catch(() => undefined)
    .then(() => {
      queryClient.getQueryCache().subscribe(({ type }) => {
        if (cacheChanges.includes(type)) save()
      })
      // Also keeps what arrived during the restore, such as the data the
      // server rendered into the first page.
      save()
    })

  const waited = Promise.race([
    restored,
    new Promise<void>((resolve) => setTimeout(resolve, restoreWaitMs)),
  ])

  restores.set(queryClient, waited)
  void waited.then(() => restores.delete(queryClient))
  void askForPersistentStorage().catch(() => undefined)

  return {
    /** Resolves once every change made so far is on the device. */
    saved: () => restored.then(() => saving),
  }
}
