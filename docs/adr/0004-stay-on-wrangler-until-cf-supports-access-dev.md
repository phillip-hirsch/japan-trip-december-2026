# Stay on Wrangler until `cf` can simulate Access locally

The Worker keeps `wrangler.jsonc`, `wrangler deploy` and `wrangler types` rather than moving to the `cf` CLI and `cloudflare.config.ts`. A full switch needs the beta `cf` CLI plus the beta `@cloudflare/vite-plugin` 2.0, and neither can express wrangler's `access.dev` block, which local development and the prerender rely on to pass the Access gate (ADR 0002). We chose to wait rather than replace that with a dev-only bypass in the gate, since that trades a working setup for security-relevant code with nothing gained.

## Consequences

- Revisit when `cf` or plugin 2.0 can supply `ctx.access` locally (or the gate gets another dev identity) and both leave beta. Until then, run no `cf` project command here: `cf migrate`, and `cf init`, `cf dev`, `cf build`, `cf deploy`, `cf previews deploy`, `cf workers versions create` and `cf workers triggers deploy`, which auto-configure without reading `wrangler.jsonc` and, outside a terminal, apply the result unprompted ([automatic configuration](https://developers.cloudflare.com/cf/projects/#automatic-configuration)). Account commands such as `cf d1 list` are fine.
- When migrating: the generated self-named `TRIP_STORE` binding and `TripStore` SQLite export match the deployed namespace, so keep the Worker and class names and ship with `cf deploy`. Local Durable Object data moves from `.wrangler/state` to `.cloudflare/state`.
- Research: `docs/research/cf-cli-migration.md`.
