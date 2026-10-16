---
status: accepted
---

# Dev and build use the `cf` CLI

Local development, the production build, and deploy run through the `cf` CLI and `@cloudflare/vite-plugin` 2.x. `worker.access.dev` in `cloudflare.config.ts` supplies `ctx.access` for the Access gate and the prerender (ADR 0002), and `cf deploy --prebuilt --mode production` publishes the Build Output from `cf build`. Wrangler stays for live logs (`wrangler tail`), one secret (`wrangler secret put`), and `wrangler types`. Ben from Cloudflare's guidance is to use the `cf` CLI unless a task still needs Wrangler.

## Considered Options

- **Stay on Wrangler for dev and build** (ADR 0004): the blocker was that `cf` could not express `access.dev`. `cf@1.0.0-beta.17` and `@cloudflare/vite-plugin@2.0.0-beta.v.0` carry it as `worker.access.dev`. Beta is acceptable.
- **Void CLI**: Ben's guidance is to use the Void CLI when the app uses the Void SDK. This app does not. Void's deploy codemod also dropped the TripStore SQLite export.
- **Drop Wrangler**: `cf` still cannot stream live logs. The documented way to set a single secret is `wrangler secret put`. `cf workers types` exists, but `wrangler types` is kept so `vp run cf-typegen` regenerates `worker-configuration.d.ts` as before.

## Consequences

- `dev` and `build` call `cf`. `deploy` runs `cf build`, then `cf deploy --prebuilt --mode production`. That command uploads the Build Output and deploys it. It is the deploy, not `wrangler versions upload`, which does not apply Durable Object lifecycle changes. The TripStore class name and sqlite export stay as they are. `locationHint: 'apac-ne'` remains the runtime hint on first `getByName` (ADR 0001). A dry run read the built assets and exited without uploading. A live deploy was not run.
- Plugin 2 reads `.dev.vars` only for declared secrets. `ACCESS_DEV_SIMULATION` is `bindings.secret()`, so local dev loads `true` from the git-ignored `.dev.vars`, and the build records `{"type":"secret"}` with no value. A declared secret is required: `cf deploy` reuses the deployed Worker's value and fails if there is none. The deployed Worker sets it to `false` (`wrangler secret put ACCESS_DEV_SIMULATION`). Never `true`. A `.dev.vars.production` file would replace `.dev.vars` for the build's preview, drop the secret, and break the prerender, so don't add one. Text bindings (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ALLOWED_EMAIL`) come from `cloudflare.config.ts`. `.dev.vars` does not override them.
- `wrangler tail`, `wrangler secret put`, and `wrangler types` read `wrangler.jsonc` only. Keep that file in step with `cloudflare.config.ts`. `vp run cf-typegen` still runs `wrangler types` and commits `worker-configuration.d.ts`.
- [workers-sdk #16250](https://github.com/cloudflare/workers-sdk/pull/16250) is open. Locally, `ctx.access` also reaches the assets Worker, which production does not do. The dev gate and the prerender still pass. Production keeps verifying the JWT in the User Worker (ADR 0002).
- Local Durable Object state lives under `.cloudflare/state`.
- `package.json` maps `vite` to `vp`, because `cf` launches Vite as `pnpm vite`. `cf dev` does not pass `--port` through to Vite; `vite.config.ts` sets port 3000.
