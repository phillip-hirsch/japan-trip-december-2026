import handler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { ConfigProvider, Effect, Exit, Layer, ManagedRuntime } from 'effect'

import { AccessGate, KeySetTransport } from '@/access/AccessGate'

// The Durable Object class, exported for the Wrangler configuration (ADR 0001).
export { TripStore } from '@/trip/TripStore'

/**
 * One gate per isolate, so its remote key set is cached at module scope. Its
 * configuration is the Worker's plain variables.
 */
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
 * gate before TanStack Start sees it. Static assets and prerendered HTML are
 * served without running the Worker, behind Cloudflare Access at the edge.
 */
export default {
  async fetch(request, _env, ctx) {
    const exit = await accessRuntime.runPromiseExit(
      AccessGate.use((gate) => gate.check(request, ctx.access)).pipe(
        Effect.tapCause(Effect.logError),
      ),
    )
    // A defect in the gate refuses the request rather than letting it through.
    if (Exit.isFailure(exit)) return refusal(503)
    const decision = exit.value
    if (decision._tag === 'Refused') return refusal(decision.status)
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
