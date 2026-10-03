import {
  Clock,
  Config,
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Schema,
} from 'effect'
import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

/** What the gate decided for one request. */
export type AccessDecision = Data.TaggedEnum<{
  Allowed: { readonly email: string }
  Refused: { readonly status: 403 | 503 }
}>

export const AccessDecision = Data.taggedEnum<AccessDecision>()

const forbidden: AccessDecision = AccessDecision.Refused({ status: 403 })

const unavailable: AccessDecision = AccessDecision.Refused({ status: 503 })

/** The request carries no identity, or one that isn't Phillip's. */
class IdentityRejected extends Schema.TaggedError<IdentityRejected>()(
  'IdentityRejected',
  { reason: Schema.String },
) {}

/** Access can't vouch for anyone right now, such as an unreachable key set. */
class AccessUnavailable extends Schema.TaggedError<AccessUnavailable>()(
  'AccessUnavailable',
  { reason: Schema.String },
) {}

/**
 * How the gate fetches the team's key set. Replaced in tests, so they control
 * what the key set serves without touching the network.
 */
export class KeySetTransport extends Context.Service<
  KeySetTransport,
  {
    readonly fetch: (url: string, init: RequestInit) => Promise<Response>
  }
>()('japan-trip/access/KeySetTransport') {
  static readonly layer = Layer.succeed(
    KeySetTransport,
    KeySetTransport.of({ fetch: (url, init) => fetch(url, init) }),
  )
}

// All three are public, so they are plain Worker variables, not secrets.
const AccessConfig = Config.all({
  teamDomain: Config.URL('ACCESS_TEAM_DOMAIN'),
  audience: Config.NonEmptyString('ACCESS_AUD'),
  allowedEmail: Config.NonEmptyString('ACCESS_ALLOWED_EMAIL'),
  // Set only in .dev.vars, so production never reads `ctx.access`.
  devSimulation: Config.Boolean('ACCESS_DEV_SIMULATION').pipe(
    Config.withDefault(false),
  ),
})

const EmailClaim = Schema.Struct({ email: Schema.String })

const decodeEmailClaim = Schema.decodeUnknownOption(EmailClaim)

/** Key lookups that fail because of the token, not because of the key set. */
const isTokenKeyMismatch = (cause: unknown) =>
  cause instanceof errors.JWKSNoMatchingKey ||
  cause instanceof errors.JWKSMultipleMatchingKeys

/**
 * The Access gate: only Phillip, proven by Cloudflare Access, gets through.
 *
 * - The `Cf-Access-Jwt-Assertion` token must be signed by a key in the team's
 *   key set (RS256 only), issued by the team domain for this application's
 *   AUD tag, unexpired, and carry the allowed email.
 * - Locally, Wrangler's Access dev simulation sends no token but sets
 *   `ctx.access` instead. With ACCESS_DEV_SIMULATION on (only in .dev.vars),
 *   a request without the header may use it, with the same AUD and email
 *   checks. Production never turns it on, so there a request without the
 *   header is always refused.
 * - 403 for any identity that fails a check; 503 when the gate can't check,
 *   because the key set is unreachable or the configuration is missing.
 */
export class AccessGate extends Context.Service<
  AccessGate,
  {
    check(
      request: Request,
      access?: CloudflareAccessContext,
    ): Effect.Effect<AccessDecision>
  }
>()('japan-trip/access/AccessGate') {
  /**
   * Holds the remote key set, so a runtime built once per isolate caches the
   * keys at module scope. Never fails: missing configuration refuses every
   * request with 503 instead, since a failed layer would be cached.
   */
  static readonly layer = Layer.effect(
    AccessGate,
    Effect.gen(function* () {
      const transport = yield* KeySetTransport
      const config = yield* Effect.option(AccessConfig)

      if (Option.isNone(config)) {
        yield* Effect.logError(
          'Access gate: ACCESS_TEAM_DOMAIN, ACCESS_AUD or ACCESS_ALLOWED_EMAIL is missing or invalid, so every request is refused.',
        )

        return AccessGate.of({ check: () => Effect.succeed(unavailable) })
      }

      const { teamDomain, audience, allowedEmail, devSimulation } = config.value
      const issuer = teamDomain.origin

      const keySet = createRemoteJWKSet(
        new URL('/cdn-cgi/access/certs', issuer),
        { [customFetch]: transport.fetch },
      )

      // Separates "the key set can't be fetched" from "the token is bad".
      const resolveKey: JWTVerifyGetKey = (header, token) =>
        keySet(header, token).catch((cause: unknown) => {
          throw isTokenKeyMismatch(cause)
            ? cause
            : new AccessUnavailable({ reason: `key set: ${String(cause)}` })
        })

      const tokenEmail = Effect.fnUntraced(function* (token: string) {
        const currentDate = new Date(yield* Clock.currentTimeMillis)

        const { payload } = yield* Effect.tryPromise({
          try: () =>
            jwtVerify(token, resolveKey, {
              issuer,
              audience,
              algorithms: ['RS256'],
              currentDate,
            }),
          catch: (cause) =>
            cause instanceof AccessUnavailable
              ? cause
              : new IdentityRejected({ reason: `token: ${String(cause)}` }),
        })

        return decodeEmailClaim(payload)
      })

      const simulatedEmail = Effect.fnUntraced(function* (
        access: CloudflareAccessContext,
      ) {
        if (access.aud !== audience) {
          return yield* new IdentityRejected({
            reason: 'Access context is for another application',
          })
        }

        const identity = yield* Effect.tryPromise({
          try: () => access.getIdentity(),
          catch: (cause) =>
            new AccessUnavailable({ reason: `identity: ${String(cause)}` }),
        })

        return decodeEmailClaim(identity)
      })

      const check = Effect.fn('AccessGate.check')(
        function* (
          request: Request,
          access?: CloudflareAccessContext,
        ): Effect.fn.Return<
          AccessDecision,
          IdentityRejected | AccessUnavailable
        > {
          const token = request.headers.get('Cf-Access-Jwt-Assertion')

          const claim =
            token !== null
              ? yield* tokenEmail(token)
              : devSimulation && access !== undefined
                ? yield* simulatedEmail(access)
                : yield* new IdentityRejected({ reason: 'no identity' })

          if (Option.isNone(claim)) {
            return yield* new IdentityRejected({ reason: 'no email claim' })
          }

          const { email } = claim.value

          if (email !== allowedEmail) {
            return yield* new IdentityRejected({ reason: 'email not allowed' })
          }

          return AccessDecision.Allowed({ email })
        },
        Effect.catchTags({
          IdentityRejected: ({ reason }) =>
            Effect.as(
              Effect.logWarning(`Access gate refused: ${reason}`),
              forbidden,
            ),
          AccessUnavailable: ({ reason }) =>
            Effect.as(
              Effect.logError(`Access gate unavailable: ${reason}`),
              unavailable,
            ),
        }),
      )

      return AccessGate.of({ check })
    }),
  )
}
