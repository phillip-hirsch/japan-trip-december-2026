# Spike report on moving from Wrangler to the cf CLI

Branch `feature/spike-cf-access-dev-d6df`, based on `b5560a4`. This branch is a throwaway spike. Do not merge it.

## Answer

Yes, locally. `pnpm exec cf dev` and `pnpm exec cf build` run this TanStack Start app on Vite+ after six small hand edits. `cf migrate` carried `access.dev` into `cloudflare.config.ts` by itself. Under `cf dev` the Access gate lets a request with no token through the dev simulation and refuses a garbage token. The prerender inside `cf build` passes. `vp check` and `vp test` pass. I deployed nothing, by design.

## Installed versions

The output of `pnpm ls cf @cloudflare/vite-plugin @cloudflare/config wrangler miniflare --depth 3` is in `versions.txt`.

- `cf` 1.0.0-beta.17.
- `@cloudflare/vite-plugin` 2.0.0-beta.v.0.
- `@cloudflare/config` 0.26.0, shared by `cf` and the plugin.
- `miniflare` 5.20261012.0-beta, shared by `cf` and the plugin.
- `wrangler` 4.148.0, still a direct devDependency with its own `miniflare` 5.20261006.0-alpha. `pnpm why wrangler` shows that nothing else depends on it.
- `vite` resolves to `@voidzero-dev/vite-plus-core` 1.1.0 through the pnpm catalog.

The plugin declares the peer `vite ^7.0.0 || ^8.0.0`. The existing `peerDependencyRules` in `pnpm-workspace.yaml` accept the Vite+ alias, and `pnpm add` printed no peer warning (`pnpm-add.log`). Vite+ 1.1.0 ran the plugin in dev, build, and preview.

## Verdicts

| Check                                                        | Verdict                | Evidence                                                                     |
| ------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------- |
| A. `access.dev` carried by migrate                           | PASS                   | `access-dev.txt`                                                             |
| B. Access gate under `cf dev`                                | PASS                   | `access-gate-cf-dev.txt`, `cf-dev.log`                                       |
| C. Prerender and `cf build`                                  | PASS                   | `cf-build.log`, `cf-build-negative-control.log`                              |
| D. TripStore SQLite Durable Object in the build output       | PASS                   | `tripstore-export.txt`                                                       |
| E. `vp check`                                                | PASS                   | `vp-check.log`                                                               |
| F. `vp test`                                                 | PASS                   | `vp-test.log`                                                                |
| G. Local `ctx.access` reaching the User Worker behind assets | PASS, it broke nothing | `access-gate-vp-preview.txt`, `vp-preview.log`, `cf-dev.log`, `cf-build.log` |

All paths are relative to `spike-evidence/`.

## Check A. Migrate carries `access.dev`

I ran `pnpm exec cf migrate --force --no-install --bundler vite`. It wrote `worker.access.dev` with the same `aud` and `identity.email` as `wrangler.jsonc`. I did not type that block. Migrate printed no Access warning. Its only follow-up items are the two Durable Object reviews (`cf-migrate.log`).

`access-dev.txt` quotes the file as migrate wrote it, before any edit, with its sha256. It then shows `git diff --no-index` from that snapshot to the final `cloudflare.config.ts`, and a comparison of the normalized `access` block, which prints `IDENTICAL`. `cloudflare.config.ts` is a new file, so a plain `git diff` against `b5560a4` has no earlier version to compare. The snapshot is `cloudflare.config.migrate-output.ts.txt`. I renamed it from `.ts` so the formatter skips it, and its hash still matches. The comparison script is `access-block.mjs.txt`.

The runtime accepts the block. Check B passed a request with no token, and the gate allows that only when `ctx.access.aud` equals `ACCESS_AUD` and `getIdentity()` returns the allowed email. No HAND experiment was needed.

Migrate details. `cf migrate` has no provisioning step and no prompt here. It rejects `--local` with "--local is not supported by cf migrate." It needs `--force` because `pnpm add` had already changed the tree. It exits 1 with "Migration requires follow-up work" and writes a `throw new Error(...)` at the top of the file, which I deleted.

## Check B. The Access gate under `cf dev`

`cf dev` delegates to `pnpm vite dev`, which runs `vp dev`. The URL was `http://localhost:3000`. `probe-gate.sh` makes the three requests.

- `GET /` with no `Cf-Access-Jwt-Assertion` returned 200 and the app's HTML.
- `GET /` with `Cf-Access-Jwt-Assertion: not-a-jwt` returned 403 with the body `Forbidden`. The dev log shows `WARN (#10): Access gate refused: token: JWSInvalid: Invalid Compact JWS`.
- `GET /_headers` returned 200 with the file's 63 bytes. Vite's own static server answered, not the assets Worker. The ETag `W/"63-1792100798296"` is the file size plus its mtime in milliseconds, which is the sirv format. `public/_headers` has size 63 and mtimeMs 1792100798295.

I stopped the dev server after the probes.

### Getting `ACCESS_DEV_SIMULATION` to the Worker in dev only

The first dev server that started had `ACCESS_DEV_SIMULATION` only in `.dev.vars`. `GET /` returned 403 and the log shows `Access gate refused: no identity` (`access-gate-no-secret.txt`, `cf-dev-attempt-2-no-simulation-secret.log`). Plugin 2 drops undeclared `.dev.vars` keys. Its `resolveLocalBindings` (`node_modules/@cloudflare/vite-plugin/dist/index.mjs:89365`) fills only bindings declared `bindings.secret()` from `.dev.vars`.

I declared `ACCESS_DEV_SIMULATION: bindings.secret()` in `cloudflare.config.ts`. The value `true` lives only in the git-ignored `.dev.vars`. The build output records the binding as `{"type":"secret"}` with no value (`tripstore-export.txt` quotes the whole file). Production keeps the gate's default of `false` as long as nobody sets that secret on the deployed Worker.

A mode-based factory, `defineConfig(({ mode }) => ...)`, would not work. It could set the value only in `development`, but `cf build` evaluates in `production` mode (`.cloudflare/output/v0/config.json` records `"mode":"production"`), so the prerender would get 403. I did not run that variant.

## Check C. Prerender and `cf build`

`cf build` delegates to `pnpm vite build`, which runs `vp build`, and exits 0. The prerender fetched `/options` and `/options/1` to `/options/4` through the local preview. Each trailing-slash URL got a 307 and each target got 200. The build output holds five HTML files with the right `<title>`, no email address, and no gate refusal text (`prerendered-html.txt`).

`checkPrerenderedHtml` logs nothing when it passes, so I ran a negative control. I added a stray `public/spike-control.html` and ran `cf build` again. It failed with "Prerendered HTML check failed: spike-control.html is not a page meant to be prerendered" and exit 1 (`cf-build-negative-control.log`). I removed the file and rebuilt clean before writing `cf-build.log`.

## Check D. TripStore in the build output

`.cloudflare/output/v0/workers/default/worker.config.json` declares `"exports":{"TripStore":{"type":"durable-object","storage":"sqlite"}}` and the self-named binding `TRIP_STORE` with `"worker":"japan-trip-december-2026","exportName":"TripStore"`. `tripstore-export.txt` quotes it. `cf build` writes no `dist` directory.

## Checks E and F

`pnpm exec vp check` exits 0. All 168 files are formatted, this report included, and it found no lint or type errors in 136 files. Earlier runs failed only on my own evidence files. The raw migrate snapshot failed until I renamed it to `.ts.txt`, and this report failed until `vp fmt` aligned its table.

`pnpm exec vp test` exits 0, with 16 test files and 359 tests passed.

`pnpm exec vp run typecheck` also exits 0 (`vp-run-typecheck.log`). Both `worker-configuration.d.ts` and the plugin's git-ignored `.cloudflare/types/index.d.ts` were on disk.

## Check G. Local `ctx.access` behind the assets router

In production the assets router does not pass `ctx.access` to the User Worker. The [Cloudflare Access page for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) says so under "ctx.access limitations". [Draft PR 16250](https://github.com/cloudflare/workers-sdk/pull/16250) says local Access metadata still reaches the User Worker behind assets, and that service binding requests keep it.

That difference broke neither the gate nor the prerender. Both depend on it.

- Dev. The plugin passes `access` to its own router Worker (`dist/index.mjs:89721`), which calls the User Worker through the `USER_WORKER` service binding. `GET /` with no token returned 200, so `ctx.access` crossed that binding.
- Preview. Under `pnpm vite preview` of the `cf build` output, the log shows `GET /_headers 404 Not Found` with the app's not-found page, not `Forbidden`. The assets Worker does not serve `_headers`, so the request fell through to the User Worker, and the gate allowed it through the simulation. `GET /options 200 OK` came straight from the assets Worker, with `cf-cache-status: HIT` and a hash ETag.
- Prerender. `cf-build.log` shows `GET /options 200 OK (29ms)` and four more 200 lines for `/options/1` to `/options/4`. It shows no `Access gate refused` line.

Production does not depend on this. The deployed gate reads the `Cf-Access-Jwt-Assertion` header, and `ACCESS_DEV_SIMULATION` is unset there.

The following risk is inferred from the PR text and was not measured. When PR 16250 and the workerd fix it depends on (cloudflare/workerd#7735) ship in a Miniflare that the plugin pins, the User Worker will lose `ctx.access` locally in dev and in preview. The gate would then refuse token-less local requests, and the prerender would fail with 403. The pinned Miniflare is 5.20261012.0-beta and the PR is still an open draft.

## Hand edits

- `package.json` scripts gained `"vite": "vp"`. `cf` runs `pnpm vite dev` and `pnpm vite build`, and pnpm runs a script before looking for a bin. Without it both fail with `Command "vite" not found` (`cf-dev-attempt-1-raw-migrate.log`).
- `cloudflare.config.ts` lost the `throw new Error("Migration incomplete...")` line that migrate writes.
- `cloudflare.config.ts` gained `ACCESS_DEV_SIMULATION: bindings.secret()` and a one-line comment.
- `cloudflare.config.ts` was reformatted by `pnpm exec vp fmt cloudflare.config.ts`. Only quotes, indentation, and line wrapping changed.
- `vite.config.ts` gained `server: { port: 3000 }`. `cf dev` does not forward `--port`, and `vp dev` otherwise binds 5173.
- `.gitignore` gained `.cloudflare`.

`pnpm add -D cf@1.0.0-beta.17 @cloudflare/vite-plugin@2.0.0-beta.v.0` changed `package.json` devDependencies and `pnpm-lock.yaml`. It also added a `minimumReleaseAgeExclude` entry for the plugin to `pnpm-workspace.yaml`. Those are tool writes, not hand edits.

I left these untouched: `wrangler.jsonc`, `worker-configuration.d.ts`, `tsconfig.json`, `.dev.vars.example`, `src/access/AccessGate.ts`, and `docs/adr/0004`.

## Behavior that changed without a hand edit

`.dev.vars` no longer overrides `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD`. Both are `bindings.text()`, and the plugin passes text bindings through unchanged. Dev now uses the production team domain for the token path. The `not-a-jwt` probe fails before any key fetch, so no check exercised this.

Local Durable Object state now lives under `.cloudflare/state`, not `.wrangler/state`.

## Blockers and open questions

There are no blockers for local dev, build, prerender, lint, types, or tests.

- Deploy is untested because `cf deploy` was banned. It is unknown whether `cf deploy` refuses to deploy while the declared `ACCESS_DEV_SIMULATION` secret has no value on the Worker. If it refuses, the secret would need the value `false`. Never set it to `true`.
- The PR 16250 change above would break the local gate path and the prerender.
- `cf` needs the `vite` script because Vite+ ships no `vite` bin.

## Wrangler leftovers

No source file imports `wrangler`. `wrangler-census.txt` lists every reference.

- `package.json` still runs Wrangler in `deploy` (`pnpm run build && wrangler deploy`) and `cf-typegen` (`wrangler types`). It keeps `wrangler` ^4.148.0 as a devDependency.
- `wrangler.jsonc` remains. The `cf dev` and `cf build` runs did not use it. The build output config matches `cloudflare.config.ts`, including the `ACCESS_DEV_SIMULATION` secret that `wrangler.jsonc` lacks.
- `worker-configuration.d.ts` is still the `wrangler types` output.
- Comments still name Wrangler in `AGENTS.md`, `README.md`, `.dev.vars.example`, `src/access/AccessGate.ts`, and `src/server.ts`.

## Environment note

The VM put the exec-daemon's Node 22.14.0 first on `PATH`. Every command ran with `/home/ubuntu/.nvm/versions/node/v22.23.3/bin` prepended.

## Reproduce

Run these from the worktree root with `.dev.vars` present.

1. `pnpm install`
2. `pnpm exec cf dev`, then `spike-evidence/probe-gate.sh http://localhost:3000`
3. `pnpm exec cf build`
4. `pnpm vite preview`, then `spike-evidence/probe-gate.sh http://localhost:4173`
5. `pnpm exec vp check` and `pnpm exec vp test`
