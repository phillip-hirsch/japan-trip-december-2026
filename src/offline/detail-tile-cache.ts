// The Detail tiles the device keeps once viewed, so the map keeps its street
// detail offline wherever Phillip looked online. The service worker answers
// every Detail tile request through it. IndexedDB holds each tile beside a
// record of when it was last viewed, so the least recently viewed tiles go
// first once the total passes the cap.

/** How many bytes of Detail tiles the device keeps. */
export const keptDetailTileBytes = 200 * 1000 * 1000

interface DetailTileCacheOptions {
  readonly indexedDB: IDBFactory
  readonly network: (request: Request) => Promise<Response>
  readonly maxBytes: number
  /** How long a network that hasn't answered may keep a kept tile waiting. */
  readonly networkTimeoutMs: number
  readonly now: () => number
}

/**
 * Keeps the service worker alive until `work` settles, as a fetch event's
 * `waitUntil` does. Keeping a tile runs after its answer.
 */
type KeepAlive = (work: Promise<void>) => void

/** A Detail tile as the device keeps it. */
interface KeptTile {
  readonly status: number
  readonly contentType: string | null
  readonly cacheControl: string | null
  readonly bytes: ArrayBuffer
  /** When the Worker's max-age for the tile runs out. */
  readonly maxAgeEndsAt: number
}

interface TileUse {
  /** Higher is more recent. */
  readonly order: number
  readonly size: number
}

interface Totals {
  readonly bytes: number
  readonly lastOrder: number
}

const databaseName = 'detail-tiles'

const tilesStore = 'tiles'

const usesStore = 'uses'

const totalsStore = 'totals'

const byOrder = 'by-order'

const totalsKey = 'totals'

const noTotals: Totals = { bytes: 0, lastOrder: 0 }

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

const openDatabase = (factory: IDBFactory) => {
  const request = factory.open(databaseName, 1)

  request.onupgradeneeded = () => {
    const database = request.result
    database.createObjectStore(tilesStore)
    database.createObjectStore(usesStore).createIndex(byOrder, 'order')
    database.createObjectStore(totalsStore)
  }

  return requestResult(request)
}

/** The cache keeps only a tile, or the Worker's 204 saying there is none. */
const keepable = (response: Response) =>
  (response.status === 200 || response.status === 204) && !response.redirected

const maxAgeSeconds = (cacheControl: string | null) => {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl ?? '')

  return match === null ? 0 : Number(match[1])
}

const responseOf = ({ status, contentType, cacheControl, bytes }: KeptTile) => {
  const headers = new Headers()

  if (contentType !== null) headers.set('Content-Type', contentType)

  if (cacheControl !== null) headers.set('Cache-Control', cacheControl)

  return new Response(status === 204 ? null : bytes, { status, headers })
}

/** Rejects once `ms` pass, unless `answer` settles first. */
const within = <T>(answer: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The network did not answer in time')),
      ms,
    )

    answer.then(resolve, reject).finally(() => clearTimeout(timer))
  })

/**
 * The cache the service worker answers Detail tiles from. A kept tile still
 * within the Worker's max-age comes from the device. Any other goes to the
 * network, and the cache keeps a successful answer, a 200 or an empty 204,
 * even one that arrives too late to use. When the network fails, takes longer than
 * `networkTimeoutMs` or answers unsuccessfully, a kept tile answers however
 * old it is. Without one, the network's answer stands, or a network error
 * offline.
 *
 * Every answer from the device counts as a view. Once the kept tiles pass
 * `maxBytes`, the cache drops the least recently viewed until they fit. When
 * IndexedDB fails, tiles come from the network alone.
 */
export const detailTileCache = (options: DetailTileCacheOptions) => {
  const { network, maxBytes, networkTimeoutMs, now } = options
  let opening: Promise<IDBDatabase> | undefined

  const database = () => {
    opening ??= openDatabase(options.indexedDB).catch((error: Error) => {
      opening = undefined
      throw error
    })

    return opening
  }

  const allStores = async (mode: IDBTransactionMode) => {
    const transaction = (await database()).transaction(
      [tilesStore, usesStore, totalsStore],
      mode,
    )

    return {
      transaction,
      tiles: transaction.objectStore(tilesStore),
      uses: transaction.objectStore(usesStore),
      totals: transaction.objectStore(totalsStore),
    }
  }

  const totalsIn = async (totals: IDBObjectStore): Promise<Totals> =>
    (await requestResult(totals.get(totalsKey))) ?? noTotals

  /** Marks the kept tile at `url` as the most recently viewed. */
  const markViewed = async (url: string) => {
    const { transaction, uses, totals } = await allStores('readwrite')
    const use: TileUse | undefined = await requestResult(uses.get(url))

    if (use !== undefined) {
      const current = await totalsIn(totals)
      const order = current.lastOrder + 1
      uses.put({ ...use, order } satisfies TileUse, url)
      totals.put({ ...current, lastOrder: order } satisfies Totals, totalsKey)
    }

    await transactionDone(transaction)
  }

  /** The kept tile at `url`, if any, which then counts as viewed. */
  const keptTile = async (url: string, keepAlive: KeepAlive) => {
    const { tiles } = await allStores('readonly')
    const kept: KeptTile | undefined = await requestResult(tiles.get(url))

    // IndexedDB runs writes in the order they start, so a later keep sees
    // this view.
    if (kept !== undefined) keepAlive(markViewed(url).catch(() => {}))

    return kept
  }

  /** Keeps `response` at `url`, then drops the least recently viewed past the cap. */
  const keep = async (url: string, response: Response) => {
    const cacheControl = response.headers.get('Cache-Control')

    const tile: KeptTile = {
      status: response.status,
      contentType: response.headers.get('Content-Type'),
      cacheControl,
      bytes: await response.arrayBuffer(),
      maxAgeEndsAt: now() + maxAgeSeconds(cacheControl) * 1000,
    }

    const { transaction, tiles, uses, totals } = await allStores('readwrite')
    const current = await totalsIn(totals)
    const replaced: TileUse | undefined = await requestResult(uses.get(url))
    const order = current.lastOrder + 1
    const size = tile.bytes.byteLength
    let bytes = current.bytes - (replaced?.size ?? 0) + size

    tiles.put(tile, url)
    uses.put({ order, size } satisfies TileUse, url)

    if (bytes > maxBytes) {
      const oldestFirst = uses.index(byOrder).openCursor()

      while (bytes > maxBytes) {
        const cursor = await requestResult(oldestFirst)

        if (cursor === null) break
        const { size: dropped }: TileUse = cursor.value
        tiles.delete(cursor.primaryKey)
        cursor.delete()
        bytes -= dropped
        cursor.continue()
      }
    }

    totals.put({ bytes, lastOrder: order } satisfies Totals, totalsKey)

    await transactionDone(transaction)
  }

  const answer = async (
    request: Request,
    keepAlive: KeepAlive,
  ): Promise<Response> => {
    const kept = await keptTile(request.url, keepAlive).catch(() => undefined)

    if (kept !== undefined && kept.maxAgeEndsAt > now()) {
      return responseOf(kept)
    }

    const fromNetwork = network(request)

    // This runs before the page reads the answer, so it copies the body while
    // the body is still unread.
    keepAlive(
      fromNetwork
        .then((response) =>
          keepable(response) ? keep(request.url, response.clone()) : undefined,
        )
        .catch(() => {}),
    )

    try {
      const response = await (kept === undefined
        ? fromNetwork
        : within(fromNetwork, networkTimeoutMs))

      return keepable(response) || kept === undefined
        ? response
        : responseOf(kept)
    } catch {
      return kept === undefined ? Response.error() : responseOf(kept)
    }
  }

  return { answer }
}
