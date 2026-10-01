import { assert, describe, it } from '@effect/vitest'
import { ConfigProvider, DateTime, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

import { AccessGate, KeySetTransport } from '@/access/AccessGate'
import type { AccessDecision } from '@/access/AccessGate'

const teamDomain = 'https://japan-trip.cloudflareaccess.com'
const audience = 'japan-trip-aud'
const allowedEmail = 'phillip@350home.com'

const configuration = {
  ACCESS_TEAM_DOMAIN: teamDomain,
  ACCESS_AUD: audience,
  ACCESS_ALLOWED_EMAIL: allowedEmail,
}

const now = DateTime.makeUnsafe('2026-10-01T09:00:00Z')
const nowSeconds = DateTime.toEpochMillis(now) / 1000

// A locally generated signing key, published in the key set as Access would.
const signingKey = await generateKeyPair('RS256')
const keySet = {
  keys: [
    {
      ...(await exportJWK(signingKey.publicKey)),
      kid: 'access-key',
      alg: 'RS256',
      use: 'sig',
    },
  ],
}

const servesKeySet = KeySetTransport.of({
  fetch: () => Promise.resolve(Response.json(keySet)),
})

interface TokenOptions {
  readonly algorithm?: string
  readonly signingKey?: CryptoKey | Uint8Array
  readonly email?: string
  readonly issuer?: string
  readonly audience?: string
  readonly expiresAt?: number
}

/** An Access token signed with the published key. */
const accessToken = (options: TokenOptions = {}) =>
  new SignJWT({ email: options.email ?? allowedEmail })
    .setProtectedHeader({
      alg: options.algorithm ?? 'RS256',
      kid: 'access-key',
    })
    .setIssuer(options.issuer ?? teamDomain)
    .setAudience(options.audience ?? audience)
    .setIssuedAt(nowSeconds - 60)
    .setExpirationTime(options.expiresAt ?? nowSeconds + 3600)
    .sign(options.signingKey ?? signingKey.privateKey)

const otherKey = await generateKeyPair('RS256')

const forbidden: AccessDecision = { _tag: 'Refused', status: 403 }
const unavailable: AccessDecision = { _tag: 'Refused', status: 503 }

const requestWith = (token?: string) =>
  new Request('https://japan-trip.workers.dev/options', {
    headers: token === undefined ? {} : { 'Cf-Access-Jwt-Assertion': token },
  })

interface GateOptions {
  readonly configuration?: Record<string, string>
  readonly transport?: KeySetTransport['Service']
}

/** The gate as one isolate builds it, with its own key cache. */
const gateWith = (options: GateOptions = {}) =>
  AccessGate.layer.pipe(
    Layer.provide([
      ConfigProvider.layer(
        ConfigProvider.fromUnknown(options.configuration ?? configuration),
      ),
      Layer.succeed(KeySetTransport, options.transport ?? servesKeySet),
    ]),
  )

const check = (
  request: Request,
  options?: GateOptions & { readonly access?: CloudflareAccessContext },
) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(DateTime.toEpochMillis(now))
    const gate = yield* AccessGate
    return yield* gate.check(request, options?.access)
  }).pipe(Effect.provide(gateWith(options)))

/** Local development's configuration, with Wrangler's Access simulation. */
const simulationConfiguration = {
  ...configuration,
  ACCESS_DEV_SIMULATION: 'true',
}

const checkToken = (options: TokenOptions) =>
  Effect.promise(() => accessToken(options)).pipe(
    Effect.flatMap((token) => check(requestWith(token))),
  )

/** The context Wrangler's Access dev simulation gives the Worker. */
const simulatedAccess = (
  aud: string,
  identity: CloudflareAccessIdentity,
): CloudflareAccessContext => ({
  aud,
  getIdentity: () => Promise.resolve(identity),
})

describe('AccessGate.check', () => {
  it.effect('allows a valid token for the allowed email', () =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(() => accessToken())
      const decision = yield* check(requestWith(token))
      assert.deepStrictEqual(decision, {
        _tag: 'Allowed',
        email: allowedEmail,
      })
    }),
  )

  it.effect('refuses a token for another email', () =>
    Effect.gen(function* () {
      const decision = yield* checkToken({ email: 'someone@example.com' })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a token for another application', () =>
    Effect.gen(function* () {
      const decision = yield* checkToken({ audience: 'another-aud' })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a token from another team', () =>
    Effect.gen(function* () {
      const decision = yield* checkToken({
        issuer: 'https://someone-else.cloudflareaccess.com',
      })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a token signed by a key outside the key set', () =>
    Effect.gen(function* () {
      const decision = yield* checkToken({ signingKey: otherKey.privateKey })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a token signed with HS256', () =>
    Effect.gen(function* () {
      const decision = yield* checkToken({
        algorithm: 'HS256',
        signingKey: new TextEncoder().encode('a shared secret anyone knows'),
      })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses an expired token', () =>
    Effect.gen(function* () {
      const decision = yield* checkToken({ expiresAt: nowSeconds - 1 })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a request without the identity header', () =>
    Effect.gen(function* () {
      const decision = yield* check(requestWith())
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('is unavailable when the key set is unreachable', () =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(() => accessToken())
      const decision = yield* check(requestWith(token), {
        transport: KeySetTransport.of({
          fetch: () => Promise.reject(new TypeError('fetch failed')),
        }),
      })
      assert.deepStrictEqual(decision, unavailable)
    }),
  )

  it.effect('is unavailable when the key set responds with an error', () =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(() => accessToken())
      const decision = yield* check(requestWith(token), {
        transport: KeySetTransport.of({
          fetch: () =>
            Promise.resolve(new Response('Bad gateway', { status: 502 })),
        }),
      })
      assert.deepStrictEqual(decision, unavailable)
    }),
  )

  for (const missing of Object.keys(configuration)) {
    it.effect(`is unavailable without ${missing}`, () =>
      Effect.gen(function* () {
        const token = yield* Effect.promise(() => accessToken())
        const decision = yield* check(requestWith(token), {
          configuration: Object.fromEntries(
            Object.entries(configuration).filter(([name]) => name !== missing),
          ),
        })
        assert.deepStrictEqual(decision, unavailable)
      }),
    )
  }
})

describe('AccessGate.check with the Access dev simulation', () => {
  it.effect('ignores a simulated identity unless the simulation is on', () =>
    Effect.gen(function* () {
      const decision = yield* check(requestWith(), {
        configuration,
        access: simulatedAccess(audience, { email: allowedEmail }),
      })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('allows the simulated identity for the allowed email', () =>
    Effect.gen(function* () {
      const decision = yield* check(requestWith(), {
        configuration: simulationConfiguration,
        access: simulatedAccess(audience, { email: allowedEmail }),
      })
      assert.deepStrictEqual(decision, {
        _tag: 'Allowed',
        email: allowedEmail,
      })
    }),
  )

  it.effect('refuses a simulated identity for another application', () =>
    Effect.gen(function* () {
      const decision = yield* check(requestWith(), {
        configuration: simulationConfiguration,
        access: simulatedAccess('another-aud', { email: allowedEmail }),
      })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a simulated identity for another email', () =>
    Effect.gen(function* () {
      const decision = yield* check(requestWith(), {
        configuration: simulationConfiguration,
        access: simulatedAccess(audience, { email: 'someone@example.com' }),
      })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )

  it.effect('refuses a simulated identity without an email', () =>
    Effect.gen(function* () {
      const decision = yield* check(requestWith(), {
        configuration: simulationConfiguration,
        access: simulatedAccess(audience, {}),
      })
      assert.deepStrictEqual(decision, forbidden)
    }),
  )
})
