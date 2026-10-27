import { assert, describe, it } from '@effect/vitest'
import { IDBFactory } from 'fake-indexeddb'

import { detailTileCache } from '@/offline/detail-tile-cache'

const origin = 'https://trip.example'

const tileUrl = (x: number) => `${origin}/tiles/detail/14/${x}/6451.mvt`

const day = 'private, max-age=86400'

/** A Detail tile of `size` bytes, each byte `fill`, as the Worker serves it. */
const tile = (fill: number, size = 10, cacheControl = day) =>
  new Response(new Uint8Array(size).fill(fill), {
    headers: {
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      'Cache-Control': cacheControl,
    },
  })

/** The Worker's answer where the archive holds no tile. */
const emptyTile = () =>
  new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'private, max-age=300' },
  })

/**
 * A Detail tile of 10 bytes, each byte `fill`, whose body sends its first
 * byte at once. After `ms` it sends the rest, or with `breaksOff` fails.
 */
const tileInParts = (fill: number, ms: number, breaksOff = false) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1).fill(fill))
        setTimeout(() => {
          if (breaksOff) {
            controller.error(new TypeError('The connection was lost'))
          } else {
            controller.enqueue(new Uint8Array(9).fill(fill))
            controller.close()
          }
        }, ms)
      },
    }),
    { headers: { 'Cache-Control': day } },
  )

/**
 * Access's login page, as a fetch that follows redirects answers a Detail
 * tile request once Phillip's session has expired.
 */
const accessLoginPage = () => {
  const page = new Response('<!doctype html><title>Sign in</title>', {
    headers: { 'Content-Type': 'text/html' },
  })

  // A Response can't be built as redirected; only a followed fetch marks it.
  Object.defineProperty(page, 'redirected', { value: true })

  return page
}

type Answer = () => Response

/**
 * The network as the service worker sees it. While online it gives each
 * address the answer set for it, after `delayMs`. Offline it fails at once.
 */
const testNetwork = () => {
  const answers = new Map<string, Answer>()
  let offline = false
  let delayMs = 0

  const fetch = async (request: Request) => {
    if (offline) throw new TypeError('Failed to fetch')
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    const answer = answers.get(request.url)

    return answer?.() ?? new Response(null, { status: 404 })
  }

  return {
    fetch,
    serve: (url: string, answer: Answer) => answers.set(url, answer),
    goOffline: () => (offline = true),
    slowDown: (ms: number) => (delayMs = ms),
  }
}

/**
 * The Detail tile cache on a fresh device, with a clock `advance` moves. Each
 * view returns once the cache has finished keeping tiles, as the service
 * worker stays alive until then.
 */
const freshDevice = (maxBytes = 1000) => {
  const network = testNetwork()
  let time = Date.UTC(2026, 11, 14, 9)
  const keeping: Array<Promise<void>> = []

  const cache = detailTileCache({
    indexedDB: new IDBFactory(),
    network: network.fetch,
    maxBytes,
    networkTimeoutMs: 20,
    now: () => time,
  })

  const view = async (x: number) => {
    const answer = await cache.answer(new Request(tileUrl(x)), (work) => {
      keeping.push(work)
    })

    await Promise.all(keeping.splice(0))

    return answer
  }

  const advance = (seconds: number) => {
    time += seconds * 1000
  }

  return { network, view, advance }
}

const bytesOf = async (response: Response) => [
  ...new Uint8Array(await response.arrayBuffer()),
]

/**
 * The fill byte of a tile `tile()` made, `no answer` for a network error, or
 * the status of any other answer.
 */
const contentOf = async (response: Response) => {
  if (response.type === 'error') return 'no answer'

  if (response.status !== 200) return `status ${response.status}`
  const [fill] = await bytesOf(response)

  return `tile ${fill}`
}

describe('Detail tiles the device keeps', () => {
  it('answers a Detail tile viewed online once the network is gone', async () => {
    const { network, view } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    assert.strictEqual(await contentOf(await view(1)), 'tile 1')

    network.goOffline()

    assert.strictEqual(await contentOf(await view(1)), 'tile 1')
  })

  it('fails a Detail tile never viewed online once the network is gone', async () => {
    const { network, view } = freshDevice()
    network.goOffline()

    assert.strictEqual(await contentOf(await view(1)), 'no answer')
  })

  it("answers a Detail tile from the device within the Worker's max-age", async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    await view(1)

    network.serve(tileUrl(1), () => tile(2))
    advance(60 * 60)

    assert.strictEqual(await contentOf(await view(1)), 'tile 1')
  })

  it("asks the network again once a kept Detail tile's max-age runs out", async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    await view(1)

    network.serve(tileUrl(1), () => tile(2))
    advance(24 * 60 * 60)

    assert.strictEqual(await contentOf(await view(1)), 'tile 2')
    network.goOffline()
    assert.strictEqual(await contentOf(await view(1)), 'tile 2')
  })

  it('keeps an empty tile, a successful answer, for its brief max-age', async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), emptyTile)
    assert.strictEqual(await contentOf(await view(1)), 'status 204')

    network.serve(tileUrl(1), () => tile(1))
    assert.strictEqual(await contentOf(await view(1)), 'status 204')

    advance(5 * 60)
    assert.strictEqual(await contentOf(await view(1)), 'tile 1')
  })

  it('answers an empty tile viewed online once the network is gone', async () => {
    const { network, view } = freshDevice()
    network.serve(tileUrl(1), emptyTile)
    await view(1)

    network.goOffline()

    assert.strictEqual(await contentOf(await view(1)), 'status 204')
  })

  it('never keeps an unavailable archive or a redirect to the Access login', async () => {
    const { network, view } = freshDevice()

    network.serve(tileUrl(1), () =>
      Response.json('Detail tiles unavailable', { status: 503 }),
    )

    network.serve(tileUrl(2), accessLoginPage)

    assert.strictEqual(await contentOf(await view(1)), 'status 503')
    assert.strictEqual((await view(2)).redirected, true)

    network.goOffline()

    assert.strictEqual(await contentOf(await view(1)), 'no answer')
    assert.strictEqual(await contentOf(await view(2)), 'no answer')
  })

  it('answers a kept Detail tile past its max-age when the archive is unavailable', async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    await view(1)

    network.serve(tileUrl(1), () => new Response(null, { status: 503 }))
    advance(24 * 60 * 60)

    assert.strictEqual(await contentOf(await view(1)), 'tile 1')
  })

  it('answers a kept Detail tile past its max-age when the network is slow, then keeps the late answer', async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    await view(1)

    network.serve(tileUrl(1), () => tile(2))
    network.slowDown(60)
    advance(24 * 60 * 60)
    assert.strictEqual(await contentOf(await view(1)), 'tile 1')

    network.goOffline()

    assert.strictEqual(await contentOf(await view(1)), 'tile 2')
  })

  it("answers a kept Detail tile past its max-age when the network's tile arrives slowly, then keeps the late answer", async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    await view(1)

    network.serve(tileUrl(1), () => tileInParts(2, 60))
    advance(24 * 60 * 60)
    assert.strictEqual(await contentOf(await view(1)), 'tile 1')

    network.goOffline()

    assert.strictEqual(await contentOf(await view(1)), 'tile 2')
  })

  it("answers a kept Detail tile past its max-age when the network's tile breaks off", async () => {
    const { network, view, advance } = freshDevice()
    network.serve(tileUrl(1), () => tile(1))
    await view(1)

    network.serve(tileUrl(1), () => tileInParts(2, 5, true))
    advance(24 * 60 * 60)

    assert.strictEqual(await contentOf(await view(1)), 'tile 1')
  })

  it('drops the least recently viewed Detail tiles once they pass the cap', async () => {
    const { network, view } = freshDevice(300)

    for (const x of [1, 2, 3, 4]) network.serve(tileUrl(x), () => tile(x, 100))

    await view(1)
    await view(2)
    await view(3)
    // Viewing tile 1 again makes tile 2 the least recently viewed.
    await view(1)
    await view(4)

    network.goOffline()

    assert.deepStrictEqual(
      await Promise.all(
        [1, 2, 3, 4].map(async (x) => contentOf(await view(x))),
      ),
      ['tile 1', 'no answer', 'tile 3', 'tile 4'],
    )
  })

  it('counts a tile the network replaced at its new size', async () => {
    const { network, view, advance } = freshDevice(300)
    network.serve(tileUrl(1), () => tile(1, 250, 'private, max-age=0'))
    network.serve(tileUrl(2), () => tile(2, 100))
    await view(1)

    network.serve(tileUrl(1), () => tile(1, 100, 'private, max-age=0'))
    advance(1)
    await view(1)
    await view(2)

    network.goOffline()

    assert.deepStrictEqual(
      [await contentOf(await view(1)), await contentOf(await view(2))],
      ['tile 1', 'tile 2'],
    )
  })
})
