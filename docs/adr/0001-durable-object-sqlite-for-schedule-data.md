# Durable Object SQLite, not D1, stores the Schedule

All editable data (the Schedule, its Checklist and notes, and archived Schedules) lives in one SQLite-backed Durable Object for Phillip, accessed through `@effect/sql-sqlite-do`, and pinned to Northeast Asia (`locationHint: 'apac-ne'`) when it is first created. We chose it over D1 because it is the only Cloudflare store where Effect v4's `effect/sql` toolkit works unchanged. Choosing an Itinerary and splitting a Stay are multi-row writes that need real transactions, and the D1 driver turns `withTransaction` into a defect. A Durable Object also runs schema migrations in the same deploy as the code and stays behind Cloudflare Access.

## Considered Options

- **D1**: offers managed tooling (a console, `wrangler d1 execute`, exports), but has no Effect transactions, runs migrations as a separate step from deploys, and caps each request at 50 queries on the free plan.
- **Convex**: the endpoint is public, so it would need a second login system alongside Access. It has no Japan region, and Effect v4 support is prerelease only.
- **Workers KV**: eventually consistent and has no transactions.

## Consequences

- The Worker entry is a custom `src/server.ts` that re-exports the TanStack Start handler and the Durable Object class. `wrangler.jsonc` declares the class under `exports`, which cannot be combined with the legacy `migrations` array, and deploys must use `wrangler deploy`.
- The object's location is permanent. Planning from outside Asia costs roughly 0.1–0.2 s more per save.
- `@effect/sql-sqlite-do` must stay pinned to exactly the same version as `effect` while Effect v4 is a release candidate.
- Research: `docs/research/storage.md`.
