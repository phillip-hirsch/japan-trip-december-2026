# Can this app leave Wrangler for Void 1.1.11

This branch is a throwaway spike. Do not merge it.

## The answer is not yet

`void migrate` copies the Wrangler config into `void.config.ts` without loss. After four hand edits, `vp dev`, `vp build` and `vp test` work, and the Access gate behaves as it does on Wrangler.

Deploying would still fail. `void deploy` runs Cloudflare's config codemod on the built Worker. The codemod flags `exports.TripStore` for manual review, and Void 1.1.11 turns that flag into a hard error. I did not run `void deploy`. I ran the one Void function that does this step, locally and with no credentials, and it threw (check D).

`vp check` also fails as committed (check E). Wrangler is still a required dependency, because the Vite plugin that Void loads needs it as a peer.

## What I ran

All work happened in `/tmp/spike-void` on branch `feature/spike-void-access-dev-d6df`, starting from `b5560a4`.

1. `pnpm install`, then `pnpm add -D void@1.1.11`. Logs are `pnpm-install.log` and `pnpm-add-void.log`.
2. `CI=1 pnpm exec void migrate </dev/null`, which exited 0. The log is `void-migrate.log`. It asked no questions and offered no provisioning step, so there was no prompt to skip.
3. `pnpm exec vp dev --port 3010 --strictPort` for dev and `pnpm exec vp build` for the build. Void 1.1.11 has no local dev or build command. `void dev` exits with "Unknown command 'dev'", and `void build` only reads remote build logs (`void-dev-build-cli.log`).

`void migrate` wrote `void.config.ts` and `void.lock.json`, deleted `wrangler.jsonc`, kept a copy at `.void/config-migration/wrangler.jsonc`, and added `.void-wrangler.jsonc` to `.gitignore`. It did not change `vite.config.ts`, `.dev.vars.example`, or the `package.json` scripts. It dropped the comments from `void.config.ts`. The original text survives in `void.lock.json`.

I did not run `void init`, because migrate succeeded. Reading `node_modules/void/dist/init-DyTEY04s.mjs` suggests init would not fit this repo. Its Vite config patcher expects a literal `plugins` array, and this repo builds its plugins with `lazyPlugins`. It also prompts for a database and a deployment platform. That is inferred from the source, not run.

## Versions

These come from `versions.txt`, refreshed after hand edit HAND-2.

- `void` 1.1.11
- `cf` 1.0.0-beta.17, a dependency of `void`
- `@cloudflare/vite-plugin` 1.64.0, from `void`. It is the copy that loads. `vite.config.ts` imports only `voidPlugin` from `void`, and `void/dist/index.mjs` imports `cloudflare` from its sibling `@cloudflare/vite-plugin@1.64.0`. The only plugin version in the stack traces of the dev attempt logs is `@cloudflare+vite-plugin@1.64.0`.
- `@cloudflare/vite-plugin` 1.63.0, still a direct devDependency but no longer imported
- `@cloudflare/config` 0.26.0
- `wrangler` 4.151.0 after HAND-2. It was 4.148.0.
- `miniflare` 5.20261012.0-beta, used by plugin 1.64.0 and wrangler 4.151.0. Miniflare 5.20261006.0-alpha remains for the unused plugin 1.63.0.
- `@cloudflare/codemods` 0.5.0 and `@cloudflare/build-output-utils` 0.9.2, both from `void`
- `@cloudflare/workers-types` 5.20261014.1, new with `void`. `HEAD` did not install it.

I did not bump the plugin by hand. Nothing here uses `@cloudflare/vite-plugin` 2.x.

## Hand edits

Each edit is the smallest change that got past one failure.

- **HAND-1.** In `vite.config.ts`, `cloudflare({ viteEnvironment: { name: 'ssr' } })` became `voidPlugin()`. Migrate deletes `wrangler.jsonc`, and `voidPlugin()` is what writes `.void-wrangler.jsonc` from `void.config.ts` and passes it to the Cloudflare plugin. I made this edit before the first dev run, so the failure without it is inferred.
- **HAND-2.** `wrangler` went from `^4.148.0` to `^4.151.0` in `package.json`. Plugin 1.64.0 refused to start with "The installed version of Wrangler (4.148.0) does not satisfy the peer dependency required by @cloudflare/vite-plugin (^4.151.0)." See `void-dev-attempt1-wrangler-peer.log`.
- **HAND-3.** I renamed `.dev.vars.example` to `env.example` without changing its content, and moved the local `.dev.vars` to `.env`. The `prepare` script now copies `env.example` to `.env`. Void's env plugin refused to start with "void/env supports one local file: .env. Remove .dev.vars, .dev.vars.example and follow the env migration guide." See `void-dev-attempt2-dev-vars.log`.
- **HAND-4.** `vite.config.ts` gained a `keepServerEntry` transform. Void replaces the Worker `main` with its generated `.void/tanstack-start-trigger-wrapper.ts`. That wrapper imports `@tanstack/react-start/server-entry` and re-exports only its default, so `src/server.ts` never runs. The Worker loses the Access gate and the `TripStore` class. workerd then failed with "Uncaught TypeError: Class extends value undefined is not a constructor or null" (`void-dev-attempt3-wrapper-skips-server-ts.log`). The transform rewrites that import to `src/server.ts` and adds `export *`. It throws if Void ever changes the import line.

`src/access/AccessGate.ts`, `docs/adr/0004` and `void.config.ts` are unchanged. `ACCESS_DEV_SIMULATION=true` lives only in the gitignored `.env`. The build copies it to `dist/server/.dev.vars` for the local preview. `dist/server/wrangler.json` has no such var, and Void's deploy step skips `.dev.vars` when it copies the bundle (`copyBundle` in `void/dist/cf-build-output-Bc8i3dzE.mjs`).

## Checks

**A. Migrate carries `access.dev`.** PASS. `void migrate` wrote both `access.dev` and `exports.TripStore` into `void.config.ts`. `compare-config.mjs` reports that the `cloudflare` object deep-equals `HEAD:wrangler.jsonc`. The sha256 of `void.config.ts` right after migrate matches the sha256 at the end of the spike, so nothing was added later. Evidence is in `access-dev.txt` and `void-migrate.log`.

**B. The gate under dev.** PASS, but only with HAND-1 through HAND-4. The probe ran against port 3010 with simulation on in `.env`.

- `GET /` with no token returned 200 `text/html`, with no redirect. The body starts with `<!DOCTYPE html>`.
- `GET /` with `Cf-Access-Jwt-Assertion: not-a-jwt` returned 403 with body `Forbidden`. The dev log has `[22:01:31.913] WARN (#10): Access gate refused: token: JWSInvalid: Invalid Compact JWS`.
- `GET /_headers` returned 200. Vite's static middleware served it (`ETag: W/"63-1792100798312"`), and the body is the one cache rule in `public/_headers`.

As a control, I set `ACCESS_DEV_SIMULATION=false` in `.env`. Then `GET /` returned 403, with `[22:03:40.043] WARN (#1): Access gate refused: no identity`, so the 200 above came from the simulation path. Setting the variable in the shell does not work, because the plugin loads `.env` as Worker secrets, which take priority over the shell value. Evidence is in `gate-probe.txt`, `void-dev.log`, `gate-probe-control-simulation-off.txt`, `void-dev-control-simulation-off.log` and the `*-invalid-shell-override*` files. I stopped the dev server after each probe.

**C. Prerender and build.** PASS, but only with the same hand edits. `pnpm exec vp build` exited 0 (`BUILD_EXIT:0`). Prerender crawled `/options` and `/options/1` through `/options/4`. Each request for the trailing-slash path got a 307 to the path without the slash, which then returned 200. No request got a 403. The repo's `checkPrerenderedHtml` plugin throws on any missing or bad page, and it did not fire. `dist/client` holds `options.html` and `options/1.html` through `options/4.html`. The log is `void-build.log`.

**D. TripStore SQLite export in the build output.** PASS for the Vite build output. The deploy step that follows it fails.

- `.cloudflare/output` does not exist. Void never writes a cf Build Output tree into the project. At deploy, `prepareCfBuildOutput` writes one to a temp directory and deletes it afterwards.
- `dist/server/wrangler.json` declares `"exports":{"TripStore":{"type":"durable-object","storage":"sqlite"}}`, next to the `TRIP_STORE` binding and `access.dev`.
- I ran `prepareCfBuildOutput` on `dist/server` with a placeholder account id (`run-void-deploy-codemod.mjs`). It threw before writing any tree, with "cf cannot migrate Cloudflare setting exports.TripStore: Durable Object exports require manual review after migration."

Evidence is in `tripstore-export.txt`, `void-deploy-codemod.log` and `cf-codemod-inspect.log`.

**E. `vp check`.** FAIL. It exits 1 at the format step, on five files that Void generated (`vp-check.log`).

- Three are under `.void/`. `void migrate` does not add `.void` to `.gitignore`, but `void init` does.
- The other two are `void.config.ts` and `void.lock.json`, which migrate writes in a style the repo formatter rejects.

I reran with three temporary changes and then reverted them (`vp-check-diagnostic.log`). With `.void` ignored and those two files formatted, one type error remains. In `src/trip/TripStore.ts:107`, `ctx.storage` is not assignable to `DurableObjectStorage` from `@cloudflare/workers-types@5.20261014.1`. `@effect/sql-sqlite-do` imports that type from its optional peer. `HEAD` never installed the peer, so the import resolved to nothing. Void installs it, and its version does not match the `workerd@1.20260926.1` types in `worker-configuration.d.ts`. With `worker-configuration.d.ts` regenerated by wrangler 4.151.0 (`workerd@1.20261012.1`), `vp check` exits 0.

**F. `vp test`.** PASS. 16 test files and 359 tests passed, exit 0 (`vp-test.log`).

**G. workers-sdk PR 16250.** PASS. The leak broke neither the gate nor prerendering. Both depend on it today. [PR 16250](https://github.com/cloudflare/workers-sdk/pull/16250) is a draft that waits on workerd#7735. It makes the assets Router Worker consume the local Access header, so the User Worker of a Worker with assets no longer gets `ctx.access`. The [`ctx.access` limitations section of Cloudflare's Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) says production already behaves this way, and it names TanStack Start.

The gate admits a request with no token only when `ACCESS_DEV_SIMULATION` is on and `ctx.access` carries the right audience and email (`AccessGate.ts` lines 169 to 174). In dev, plugin 1.64.0 sends every non-asset request to `__router-worker__`, which has `access` set and calls the User Worker over a service binding. So the tokenless 200 on `/` in check B is `ctx.access` leaking through the router.

Prerender also passed the gate with no token. It printed "Using secrets defined in dist/server/.dev.vars" and "✨ Parsed 1 valid header rule.", then `GET /options 200 OK (27ms)`. The header-rule line comes from the assets config that Miniflare's assets router uses, so I infer that prerender requests also reached the User Worker through that router. `/_headers` never reached a Worker. Vite's static middleware served it.

Once workerd#7735 and PR 16250 ship, I expect tokenless dev requests and prerender to get 403 "no identity". That would fail checks B and C. That is inferred from the PR's tests, which expect `hasAccess: false` for `runWorkerFirst` false, true and path patterns. It is not observed. The change is in shared Miniflare, so it would hit Wrangler and Void alike.

## Blockers

- `void deploy` cannot ship this config. Void's `assertHandledFollowUps` (`cf-build-output-Bc8i3dzE.mjs` line 120) accepts codemod follow-ups for `assets.directory`, `durable_objects.bindings.N`, `migrations` and `containers`, but not `exports.*`. Void derives Durable Object exports itself only from `migrations`, and this config uses the top-level `exports` field instead. That comes from reading the source, and the local run of the same function confirms it.
- Void's TanStack Start wrapper ignores a custom server entry. HAND-4 works around that by rewriting a generated file at transform time. That breaks if Void changes the wrapper.
- `vp check` fails until `.void` is ignored, the two generated files are formatted, and the Worker types are regenerated.
- `vp run cf-typegen` is broken. `wrangler types` finds no config file now that `wrangler.jsonc` is gone (`cf-typegen-probe.log`). `wrangler types --config .void-wrangler.jsonc` works.
- `pnpm run deploy` still runs `wrangler deploy`. I did not run it, because the brief bans it. It would probably find no config, since `wrangler.jsonc` is gone and Void moves the build's deploy pointer out of `.wrangler/deploy` after each build. That is inferred from `stashCloudflareDeployPointer` in `void/dist/cloudflare-config-rdFOys4X.mjs`.

## Wrangler is still in the project

No file under `src` or `tools` imports `wrangler`, and neither does `vite.config.ts`. Wrangler still shows up in these places.

- The `deploy` script runs `wrangler deploy`, and the `cf-typegen` script runs `wrangler types`.
- `wrangler` 4.151.0 is a devDependency, because plugin 1.64.0 requires it as a peer.
- `void.config.ts` sets `$schema` to `node_modules/wrangler/config-schema.json`.
- `worker-configuration.d.ts` comes from `wrangler types`.
- Comments in `src/server.ts` and `src/access/AccessGate.ts` still describe Wrangler, and `env.example` still talks about `.dev.vars`.

## Recommendation

Stay on Wrangler, as ADR 0004 says. Void runs this app locally once four hand edits are in, but it cannot deploy the Durable Object export. One hand edit also rewrites Void's generated code. Three upstream changes would reopen the question. Void would need to accept or derive `exports` declarations at deploy, and to honor a TanStack Start custom server entry. Its migrate command would also need to move `.dev.vars` to `.env` and add `.void` to `.gitignore`. The PR 16250 risk does not favor either stack, because Wrangler shares the same Miniflare.
