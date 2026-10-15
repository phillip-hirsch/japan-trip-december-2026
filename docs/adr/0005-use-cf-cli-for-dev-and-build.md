---
status: accepted
---

# Dev and build use the `cf` CLI

Local development and the production build run through `cf dev` and `cf build` with `@cloudflare/vite-plugin` 2.x, and `worker.access.dev` in `cloudflare.config.ts` supplies `ctx.access` for the Access gate and the prerender (ADR 0002). `wrangler.jsonc` and Wrangler stay for live logs (`wrangler tail`), one secret (`wrangler secret put`), `wrangler deploy`, and `wrangler types`. Ben from Cloudflare's guidance is to use the `cf` CLI unless a task still needs Wrangler; this app does not use the Void SDK.

## Considered Options

- **Stay on Wrangler for dev and build** (ADR 0004): the blocker was that `cf` could not express `access.dev`. `cf@1.0.0-beta.17` and `@cloudflare/vite-plugin@2.0.0-beta.v.0` carry it as `worker.access.dev`. Beta is acceptable.
- **Void CLI**: Ben's guidance is to use the Void CLI when the app uses the Void SDK. This app does not. Void's deploy codemod also dropped the TripStore SQLite export.
- **Drop Wrangler**: `cf` still cannot stream live logs. The documented way to set a single secret is `wrangler secret put`. `cf deploy` was not run, so deploys stay on Wrangler too.

## Consequences

- `dev` and `build` call `cf`. `deploy` runs `cf build` and then `wrangler deploy`. `cf deploy` is unverified.
- Plugin 2 reads `.dev.vars` only for declared secrets. `ACCESS_DEV_SIMULATION` is `bindings.secret()`, so local dev loads `true` from the git-ignored `.dev.vars`, and the build records `{"type":"secret"}` with no value. Leave that secret unset on the deployed Worker. Text bindings (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ALLOWED_EMAIL`) come from `cloudflare.config.ts`. `.dev.vars` does not override them.
- `wrangler tail`, `wrangler secret put`, `wrangler deploy`, and `wrangler types` read `wrangler.jsonc` only. Keep that file in step with `cloudflare.config.ts`. `vp run cf-typegen` still runs `wrangler types` and commits `worker-configuration.d.ts`.
- [workers-sdk #16250](https://github.com/cloudflare/workers-sdk/pull/16250) is open. Locally, `ctx.access` also reaches the assets Worker, which production does not do. The dev gate and the prerender still pass. Production keeps verifying the JWT in the User Worker (ADR 0002).
- Local Durable Object state lives under `.cloudflare/state`.
- `package.json` maps `vite` to `vp`, because `cf` launches Vite as `pnpm vite`. `cf dev` ignores `--port`; `vite.config.ts` sets port 3000.
