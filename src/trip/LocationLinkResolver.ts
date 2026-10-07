import { Context, Effect, Layer, Schema } from 'effect'

/** The status and any Location header that one request for a link got. */
export interface LinkResponse {
  readonly status: number
  readonly location?: string
}

/** A request for a link got no answer, such as from a network failure. */
export class LinkRequestFailed extends Schema.TaggedError<LinkRequestFailed>()(
  'LinkRequestFailed',
  { cause: Schema.Defect() },
) {}

/**
 * How the Trip service follows a short Google Maps link, one request at a
 * time, so it checks every redirect itself. Replaced in tests, so they
 * replay recorded responses without touching the network.
 */
export class LocationLinkResolver extends Context.Service<
  LocationLinkResolver,
  {
    /** Requests a URL once, never following a redirect. */
    readonly request: (
      url: URL,
    ) => Effect.Effect<LinkResponse, LinkRequestFailed>
  }
>()('japan-trip/trip/LocationLinkResolver') {
  static readonly layer = Layer.succeed(
    LocationLinkResolver,
    LocationLinkResolver.of({
      request: (url) =>
        Effect.tryPromise({
          try: async (signal) => {
            const response = await fetch(url, { redirect: 'manual', signal })
            // Only the status and Location matter, so this cancels the body
            // unread.
            await response.body?.cancel()
            const location = response.headers.get('Location')

            return {
              status: response.status,
              ...(location !== null && { location }),
            }
          },
          catch: (cause) => new LinkRequestFailed({ cause }),
        }),
    }),
  )
}
