# Cloudflare Access instead of an in-app login

The app has one user and holds his bookings, notes and day-by-day whereabouts, so the whole Worker sits behind Cloudflare Access: an email one-time-PIN policy allowing only phillip@350home.com, with sessions set to one month. The app itself has no login screen and no user table. As defence in depth, `src/server.ts` verifies the `Cf-Access-Jwt-Assertion` header against the team's JWKS (issuer, audience, RS256) and rejects any other email. We chose this over Clerk or a custom login because it adds no login code, keeps a single identity system (see ADR 0001), and protects the free `workers.dev` address directly.

## Consequences

- Access protects the running app, not the source. The GitHub repository is deliberately public, so the Itineraries (with Trip dates), this ADR and the planning issues are public too. Personal data that must stay private (the Schedule, Checklist and notes) lives only in storage (ADR 0001) and never in the repository.
- `ctx.access` is not available in production for TanStack Start, because the Static Assets router drops it, so the Worker must verify the JWT itself. In local development, wrangler's `access.dev` block supplies `ctx.access` instead.
- It is not documented whether Worker-level Access injects the JWT header. Confirm this on the first deploy; if it doesn't, fall back to a hostname-based Access app on the `workers.dev` hostname.
- An expired session breaks `fetch()` calls with an opaque redirect. Server-function calls send `X-Requested-With: XMLHttpRequest` and `redirect: 'manual'`, treat a 401 or `opaqueredirect` response as "session expired", keep unsaved input, and reload the page at the top level to log in again.
- Worker-level Access blocks WebSockets, which is acceptable because devices sync when the app is opened or regains focus.
- Before the trip, Phillip logs in in Safari on his iPhone and then adds the app to the Home Screen, since iOS copies cookies into the installed app only once, at install time.
- Research: `docs/research/cloudflare-access.md`.
