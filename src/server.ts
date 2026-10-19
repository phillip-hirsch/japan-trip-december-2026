import handler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { ConfigProvider, Effect, Exit, Layer, ManagedRuntime } from 'effect'

import {
  AccessDecision,
  AccessGate,
  KeySetTransport,
} from '@/access/AccessGate'
import {
  detailTileOf,
  serveDetailTile,
} from '@/trip/detail-tiles/detail-tile-route.server'

// The Durable Object class, exported for the Worker configuration (ADR 0001).
export { TripStore } from '@/trip/trip-store/TripStore'

const accessRuntime = ManagedRuntime.make(
  AccessGate.layer.pipe(
    Layer.provide([
      KeySetTransport.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown(env)),
    ]),
  ),
)

const refusal = (status: 403 | 503) =>
  new Response(status === 403 ? 'Forbidden' : 'Access check unavailable', {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

/**
 * The Worker entry: every request that reaches the Worker passes the Access
 * gate before a Detail tile or TanStack Start answers it. Static assets and
 * prerendered HTML are served without running the Worker, behind Cloudflare
 * Access at the edge.
 */
export default {
  async fetch(request, _env, ctx) {
    const exit = await accessRuntime.runPromiseExit(
      AccessGate.use((gate) => gate.check(request, ctx.access)).pipe(
        Effect.tapCause(Effect.logError),
      ),
    )

    if (Exit.isFailure(exit)) return refusal(503)
    const decision = exit.value

    if (AccessDecision.$is('Refused')(decision)) return refusal(decision.status)

    const tile = detailTileOf(request)

    if (tile !== undefined) return serveDetailTile(tile)

    return handler.fetch(request, { context: { email: decision.email } })
  },
} satisfies ExportedHandler<Env>

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      /** The email the Access gate verified for this request. */
      requestContext: { readonly email: string }
    }
  }
}
