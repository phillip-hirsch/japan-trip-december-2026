# Offline read (tier a) and offline write-with-sync (tier b) options for the Japan Trip app on TanStack Start + Cloudflare Workers + Vite+, as of 2026-09-29

# Fact sheet: offline read/write options (verified 2026-09-29)

Legend: **[V]** = verified by me against a primary source today; **[V-B]** = verified by inspecting Report B's surviving build artifacts (not re-run); **[U]** = plausible but not independently verified.

## 0. Project baseline

- Toolchain: vite-plus 1.0.0 -> vite 8.3.1 -> rolldown 1.2.11; @tanstack/react-start 1.168.59, @tanstack/react-router 1.170.40, react 19.3.0 with `viteReact({ compiler: true })`, effect 4.0.0-rc.118, typescript 7.0.2, `cloudflare({ viteEnvironment: { name: 'ssr' } })`, wrangler.jsonc `main: "@tanstack/react-start/server-entry"`. **[V]** (`vp toolchain vite`, `/Users/phillip/Developer/japan-trip-december-2026/vite.config.ts`, `package.json`, `wrangler.jsonc`)
- SPA mode is NOT enabled today (`tanstackStart()` with no options). **[V]** (vite.config.ts)
- Current client JS baseline: 339 KB min / 108 KB gz. **[V-B]** (`tmp.gua6oCkMla/dist/client/assets/index-*.js`, re-measured with gzip -9)
- TanStack Start has zero docs on service workers/PWA/offline (45 React Start docs, no path matches pwa|offline|service|worker), and the installed `@tanstack/react-start` / `start-plugin-core` contain no serviceWorker/webmanifest handling. **[V]** (GitHub tree API; grep of node_modules)

## 1. Service worker / PWA on this stack

### vite-plugin-pwa 1.3.0 (published 2026-05-05; peer `vite ^3.1||^4||^5||^6||^7||^8`)

- **Does not emit sw.js on this stack.** Guard `if (!ctx.viteConfig.build.ssr)` at `node_modules/vite-plugin-pwa/dist/index.js:422`; with Start + Cloudflare every environment's resolved config reports `build.ssr = true`, so generation is skipped. **[V]** guard location; **[V-B]** failing build (Report B reproduced; not re-run by me)
- Upstream: TanStack/router#4988 OPEN (2025-08-17, last update 2026-07-15). Maintainer LadyBluenotes (MEMBER, 2026-07-15): "vite-plugin-pwa's Vite Environment API support is still open in vite-pwa#786 ... Keeping this open as an upstream integration issue." A community `integration.closeBundleOrder: 'pre'` workaround was reported working for Start **+ Nitro** in SPA mode; Report B says it did not help with @cloudflare/vite-plugin. **[V]** issue + comments; **[U]** the Cloudflare-specific negative result
- vite-pwa#786 (Environment API, PR) OPEN since 2024-11-15, last touched 2025-02-11; vite-pwa#903 (second attempt) OPEN since 2025-11-13; vite-pwa#940 (Vite 8 sharedConfigBuild double-generation) OPEN since 2026-07-28. **[V]**
- Maintainer (userquin) in vite-pwa#933 (2026-05-16, updated 2026-09-13): "The existing `vite-plugin-pwa` package will remain frozen in maintenance mode, receiving only critical fixes"; successor `@vite-pwa/core` + `@vite-pwa/workbox` announced, "meta-framework integrations will be updated last". Neither `@vite-pwa/core` nor `@vite-pwa/workbox` exists on npm as of today (404). **[V]**

### Serwist: serwist / @serwist/vite / @serwist/build 9.5.12 (published 2026-07-22; `@serwist/vite` peers `vite >=5`)

- Same guard: `if (!ctx.viteConfig.build.ssr && !ctx.options.disable) await api.generateSW()` at `node_modules/@serwist/vite/dist/index.mjs:247`. **[V]**
- serwist/serwist#300 OPEN since 2025-11-05 (last update 2026-04-20). Maintainer DuCanhGH (2025-11-23): root cause is "checking `!viteConfig.build.ssr` ... TanStack Start ... doesn't have any non-SSR build at all". Same root cause reproduced with Astro in 2026-04. **[V]**
- Serwist 10 is stuck at `10.0.0-preview.14` (dist-tag `preview`); 9.x still receives patches. **[V]** (`pnpm view serwist dist-tags`)
- The Serwist **runtime** (`serwist` package, used inside the SW) is unaffected by the Vite plugin bug: 31 KB min / 10 KB gz standalone; the `injectManifest` function from `@serwist/build` works as a plain Node API. **[V-B]** (`tmp.eQDd9wBe6Q/out/serwist.js`; sw-plugin.ts)

### Hand-written SW build (works)

- A ~35-line Vite plugin (`buildApp: { order: 'post' }`, `enforce: 'post'`) that runs vite-plus `build()` in lib/IIFE mode on `src/sw.ts` and then `injectManifest` from `@serwist/build` produced `dist/client/sw.js` = 54,461 B min / 16,061 B gz, precaching 4 entries incl. `_shell.html`. Source: `/var/folders/f1/nvhgj4r110960rknvqsfksmc0000gn/T/tmp.gua6oCkMla/sw-plugin.ts` and `src/sw.ts`. **[V-B]** (artifacts inspected and re-measured; build not re-run; browser install/offline behaviour untested by anyone)
- Because `buildApp` post runs after Start's prerender step, the shell exists when the manifest is generated; a `closeBundle` + `applyToEnvironment(env => env.name === 'client')` variant runs too early for the shell. **[U]** (Report B claim, consistent with Vite hook order)

### SPA shell (`/_shell.html`) and TanStack/router#7740

- Start SPA mode (`tanstackStart({ spa: { enabled: true } })`) prerenders the **root route only** to `/_shell.html`; docs recommend rewriting 404s to the shell. **[V]** (docs/start/framework/react/guide/spa-mode.md)
- **#7740 OPEN** (2026-07-03, updated 2026-08-20): with @cloudflare/vite-plugin the shell contains the `/` route's rendered content and loader data. Root cause (commenter yangchristina): the handler trusts `X-TSS_SHELL` only when `process.env.TSS_PRERENDERING` is set in its own process; the prerenderer sets it on the Vite node process but the SSR build runs in workerd, so `router.isShell()` stays false. Documented workaround: `define: { "process.env.TSS_PRERENDERING": JSON.stringify("true"), "process.env.TSS_SHELL": JSON.stringify("true") }`. **[V]**
- Report B's shell was data-free (1,411 B, empty `<body>`), **but only because its index route was `ssr: false`** (hydration payload shows `"/": ssr:!1, s:"pending"`). It therefore does not disprove #7740 for SSR'd routes. **[V]** (`tmp.gua6oCkMla/dist/client/_shell.html`, `src/routes/index.tsx`)

### Cloudflare Access interactions

- Manifest: "If the manifest requires credentials to fetch, the `crossorigin` attribute must be set to `use-credentials`, even if the manifest file is in the same origin." **[V]** (MDN Manifest page)
- Access global session: 15 min to 1 month, default 24 h; application/policy session: immediate to 1 month, default 24 h. **[V]** (developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- Whether the SW script fetch and `/_serverFn` calls behave as expected after Access expiry (302 vs CORS error) — **[U]**, untested by both reports.

### Browser storage on iPhone

- WebKit: all origins are best-effort by default; eviction under quota/storage pressure via LRU on last interaction; origins in persistent mode or with an active page are excluded; Home Screen web apps get the same quota as the browser. **[V]** (webkit.org/blog/14403, 2023-08-10)

## 2. TanStack DB

- Published versions (all 2026-09-14 unless noted): `@tanstack/db` 0.9.2 (peer `typescript >=4.7`), `@tanstack/react-db` 0.4.1 (peer `react >=16.8`, deps `use-sync-external-store ^1.6.0`), `@tanstack/query-db-collection` 1.2.15 (peer `@tanstack/query-core ^5`), `@tanstack/offline-transactions` 1.0.56 (optional RN peers only), `@tanstack/browser-db-sqlite-persistence` 0.2.23 (peer `@journeyapps/wa-sqlite ^1.4.1`), `@tanstack/db-sqlite-persistence-core` 0.2.23, `@tanstack/cloudflare-durable-objects-db-sqlite-persistence` 0.2.23, `@tanstack/react-router-with-db` 0.1.0 (2026-08-18). **[V]**
- Unreleased on main: `@tanstack/db` 0.10.0 (deprecates mutation-handler return values and QueryCollection auto-refetch, "will be removed in v1.0") and `offline-transactions` 1.0.57. **[V]** (raw CHANGELOG.md / package.json on main)
- The 1.x numbers on offline-transactions/query-db-collection are Changesets artifacts: `## 1.0.0` lists only "Patch Changes: Updated dependencies -> @tanstack/db@0.5.0". Treat the whole stack as **beta / pre-1.0**. **[V]**
- offline-transactions README: IndexedDB with localStorage fallback; leader election via Web Locks (BroadcastChannel fallback), non-leader tabs run online-only; FIFO sequential processing; exponential backoff + jitter; `idempotencyKey` passed to mutationFn; `NonRetriableError` marks failed/rolls back; "Mutation is persisted to IndexedDB/localStorage" before execution. It persists the **outbox only**, not collection rows. **[V]**
- browser-db-sqlite-persistence: wa-sqlite + OPFS in a dedicated Web Worker; OPFS failures surface as `PersistenceUnavailableError`. Bundle in a real Vite+ build: OPFS worker 1,698,339 B / **704,616 B gz** (wasm inlined). **[V-B]**
- Open offline-path issues (all OPEN): #1939 (2026-09-29, offline action reports success after leadership loss before outbox admission), #1602 (2026-06-19, optimistic state dropped before sync echo), #1416 (2026-03-27, useLiveQuery blocks rendering of persisted rows when sync source unavailable), #1659 RFC hardening persistence (updated 2026-09-28). **[V]**
- React Compiler: #391 (`useLiveQuery` broken with React Compiler) CLOSED 2025-08-18. react-db uses `use-sync-external-store`, the Compiler-safe subscription primitive. No open Compiler issues found. **[V]**
- Typecheck on this stack: query collection + `startOfflineExecutor` + `useLiveQuery` typechecks; `persistedCollectionOptions(queryCollectionOptions(...))` fails TS2769 on 0.9.2/0.2.23. PR #1866 "preserve persistence type contracts" **MERGED 2026-09-22** but not yet published. **[V]** PR state; **[V-B]** the TS2769 result
- Bundle (esbuild, minified, gzip -9): react-db core 285 KB / 81 KB gz; + query-db-collection + query-core 340 KB / 98 KB gz; + offline-transactions 366 KB / 104 KB gz. **[V-B]** (re-measured from `tmp.eQDd9wBe6Q/out/*.js`)

## 3. TanStack Query 5.104.0 (2026-09-26) as the stable alternative

- `@tanstack/react-query`, `react-query-persist-client`, `query-async-storage-persister` all 5.104.0, peer `react ^18 || ^19`. **[V]**
- persistQueryClient: `maxAge` default 24 h; `gcTime` must be >= maxAge; **max gcTime is ~24 days due to setTimeout limits** unless you use `timeoutManager.setTimeoutProvider`; `buster` string invalidates the persisted cache. **[V]** (docs/framework/react/plugins/persistQueryClient.md)
- Offline mutations: "mutations cannot be resumed when the page is reloaded unless you provide a default mutation function" (`setMutationDefaults` + `resumePausedMutations`), because only mutation state is serialized. **[V]** (guides/mutations.md)
- `createAsyncStoragePersister` `throttleTime` default 1000 ms -> a write made <1 s before the app is killed may not be persisted. **[V]** default; **[U]** the loss scenario (inference)
- Bundle: react-query + persist-client + async-storage-persister + idb-keyval = 40.6 KB / 12.2 KB gz; idb-keyval alone 591 B / 360 B gz. **[V-B]**

## 4. Durable Objects + WebSocket (hand-rolled)

- DOs available on Workers Free (SQLite backend only); Free: 100k requests/day, 13,000 GB-s/day. **[V]** (durable-objects/platform/pricing)
- Hibernation WebSocket API is the recommended API; clients stay connected while the DO is evicted from memory; in-memory state is lost on hibernation. **[V]** (best-practices/websockets)
- Cloudflare's TanStack Start guide shows a custom `src/server.ts` that re-exports `handler.fetch` from `@tanstack/react-start/server-entry` and `export { MyDurableObject }`; Start's own server-entry-point.md links to it. Wrangler `main` changes to `src/server.ts`. **[V]**
- Client cost: native WebSocket = 0; partysocket 1.3.0 (2026-06-23) = 8.4 KB / 2.7 KB gz. **[V]** version; **[V-B]** size
- You own: local store, durable outbox, dedupe by op id, cursor/sequence for pulls, reconnect/backoff, conflict policy, migrations. **[U]** (both reports' assessment; sound)

## 5. Other local-first libraries

- **Replicache 15.3.0** (last publish 2025-07-02). replicache.dev: "Replicache is now in maintenance mode ... We will continue to support Replicache, but won't add new features. Existing users should migrate to Zero." 115 KB / 35.6 KB gz. Needs your own push/pull backend. **[V]** status; **[V-B]** size
- **Zero** (`@rocicorp/zero`): 1.0.0 published 2026-03-24 (GA), latest 1.9.0 (2026-08-14). Docs: "Zero does not support offline writes ... writes are rejected" when disconnected; SSR listed under 2026 non-committed roadmap; requires Postgres + zero-cache. **Excluded for tier (b).** **[V]**
- **LiveStore** `@livestore/react` 0.4.0 (2026-06-02) peers `effect ^3.21.2` (conflicts with effect 4.0.0-rc.118); only `0.5.0-dev.0` (2026-08-24, `dev` tag) peers `effect ^4.0.0-rc.111`. Docs: "currently in beta"; minor releases may break API and client storage format. First-party `@livestore/sync-cf` uses a DO per storeId, DO SQLite by default (optional D1), WebSocket recommended. **[V]**
- **Jazz** `jazz-tools` latest 0.20.19 (2026-07-03); `alpha` 2.0.0-alpha.57 (2026-09-26, peer `react >=19`). Rewrite in progress. **[V]**
- **Automerge** `@automerge/automerge` 3.5.0 (2026-09-16), wasm 3,644,225 B / **1,136,563 B gz**; `@automerge/automerge-repo` dist-tag `latest` = 2.6.0-alpha.3 (stable 2.5.6 from 2026-05-18). CRDT merge is unnecessary for one user editing structured rows. **[V]**

## 6. Conflict handling for one user on two devices (analysis, both reports agree)

- All server-authoritative queues replay FIFO on reconnect => default outcome is "last to sync wins", not "last edit wins". Fix: client UUIDs, per-field patches with per-field `updatedAt` (LWW), tombstones for deletes, server-side dedupe of op/idempotency ids. CRDTs only pay off for concurrent rich-text editing. **[U]** (reasoning, not a sourced fact; consistent with offline-transactions README semantics)

## Disagreements between researchers

- Viability of vite-plugin-pwa / @serwist/vite: Report A rated fit as 'uncertain'; Report B reproduced both failing to emit sw.js. Resolved in B's favour: I confirmed the `!ctx.viteConfig.build.ssr` guard in the installed code of both plugins (vite-plugin-pwa dist/index.js:422, @serwist/vite dist/index.mjs:247), maintainer comments on TanStack/router#4988 and serwist#300 naming that guard as the root cause, and all upstream fixes (vite-pwa#786, #903, #940, serwist#300) still OPEN. Neither is usable without hacks on this stack.
- Safety of precaching `/_shell.html`: Report A said do not treat it as a neutral offline entry because of TanStack/router#7740; Report B recommended precaching it and reported a clean shell. Resolved as 'both partly right': #7740 is OPEN and has a confirmed root cause (TSS_PRERENDERING env does not cross into workerd, so the shell is a full SSR of `/`). B's shell was clean only because its index route was `ssr: false` (visible in the hydration payload). The shell is usable if you either apply the documented `define` workaround for `process.env.TSS_PRERENDERING`/`TSS_SHELL`, or disable SSR on the routes reachable from `/`, and add a build-time assertion that the shell carries no loader data.
- Adopting TanStack DB for offline writes: Report A called it too immature for a reliability-first app; Report B recommended it pinned to exact versions. Facts are not in dispute (both agree it is beta; I confirmed pre-1.0 core with breaking minors on 08-12, 08-18, 09-10, a pending 0.10.0 with deprecations, four OPEN offline-path correctness issues including one filed today, ~104 KB gz added on a 108 KB gz baseline, and offline docs living only in package READMEs). Resolved toward A on the risk judgement given the stated priorities (reliability first, small single-user dataset, fixed Dec 6 deadline), while keeping B's verified point that it does build/typecheck with React Compiler and TS 7 and is the only off-the-shelf outbox with leader election and rollback. See recommendation.
- Serwist maintenance status: Report A said 'maintained', Report B said 'v10 stuck in preview since 2025-09-03'. Both true: 9.x still gets patches (9.5.12 on 2026-07-22) while 10.0.0-preview.14 is the only 10.x tag. Serwist's runtime and `injectManifest` API are fine; only its Vite plugin is broken for Start.
- Zero timeline: A said 'GA since March 2026', B cited 1.9.0 on 2026-08-14. Both correct: 1.0.0 was published 2026-03-24 and 1.9.0 on 2026-08-14. Both agree it rejects offline writes, which I confirmed in the docs.
- Automerge-repo version: A cited stable 2.5.6, B noted the npm `latest` tag points at 2.6.0-alpha.3. Both correct; registry confirms `latest` = 2.6.0-alpha.3 and 2.5.6 published 2026-05-18.
- Replicache: A described it as mature-but-maintenance and first choice if a library is wanted; B ruled it out. Resolved toward B for the primary path (maintenance mode confirmed verbatim on replicache.dev, last publish 2025-07-02, still requires a hand-built push/pull backend so it saves less than it appears), but it remains the most battle-tested buy option at 35.6 KB gz if the user prefers a library over TanStack DB.
- Report A's package versions were sourced from GitHub because `pnpm view` failed in its sandbox. I re-ran `pnpm view` for every package; all of A's version numbers matched the registry, and B's publish dates all matched.

## Recommendation

Tier (a), offline read — do now with stable pieces only:

1. Ship a hand-written service worker via a ~35-line Vite plugin using a post-order `buildApp` hook (vite-plus `build()` in lib/IIFE mode + `injectManifest` from `@serwist/build` 9.5.12, `serwist` 9.5.12 runtime, about 16 KB gz). Do not use vite-plugin-pwa 1.3.0 or @serwist/vite 9.5.12; both skip SW generation on Start + Cloudflare and upstream fixes are stalled. Report B's working plugin is at /var/folders/f1/nvhgj4r110960rknvqsfksmc0000gn/T/tmp.gua6oCkMla/sw-plugin.ts.
2. Enable Start SPA mode and precache `/_shell.html` plus hashed assets, with network-first navigation (short timeout) falling back to the shell, and `/_serverFn` and `/api` excluded. Apply the #7740 `define` workaround (`process.env.TSS_PRERENDERING` / `TSS_SHELL` = "true") and make the SW build plugin fail if the shell contains hydration loader data.
3. Persist the trip snapshot (Schedule, Checklist, notes) to IndexedDB with TanStack Query 5.104.0 + `persistQueryClient` + async-storage persister over idb-keyval (~12 KB gz). Set `buster` to the schema version, `maxAge`/`gcTime` to ~24 days (setTimeout ceiling) or install a `setTimeoutProvider`.
4. Access/storage hygiene: `<link rel="manifest" crossorigin="use-credentials">`, raise Access application and global session to one month, treat Access-login redirects as "auth expired" (force top-level navigation) rather than "offline", call `navigator.storage.persist()`, install to Home Screen on the phone.
5. Spike required before committing: build once with the SW plugin on the real repo, deploy to a preview Worker behind Access, and test cold-start offline on the actual phone.

Tier (b), offline writes — build a small app-owned outbox rather than adopting a beta sync stack:

- Client: on every mutation, synchronously append `{opId: uuid, entity, id, field patches, clientUpdatedAt}` to an IndexedDB outbox BEFORE applying the optimistic update; drain FIFO on `online`, `visibilitychange`, and app open; retry with backoff; treat 4xx as non-retriable (roll back and surface). For one user this is roughly 150-250 lines and fits naturally in Effect.
- Server: a Worker endpoint backed by one SQLite-backed Durable Object (exported from a custom `src/server.ts` alongside the Start handler; Wrangler `main` updated). Store applied `opId`s for dedupe, per-field `updatedAt` for last-writer-wins, tombstones for deletes, and a monotonic revision so the client pulls deltas since its cursor.
- Freshness: pull on open/focus/reconnect. Add a DO Hibernation-WebSocket "changed" ping (native WebSocket or partysocket 1.3.0, ~2.7 KB gz) only if live phone<->desktop updates turn out to matter.
- Why not TanStack DB now: pre-1.0 core with breaking minors every 2-4 weeks, 0.10.0 deprecations pending, four open correctness issues on exactly the offline path (one filed today), ~104 KB gz added to a 108 KB baseline, and a dataset of a few hundred rows that does not need live differential queries. It is the fallback if you would rather buy than build: pin @tanstack/db 0.9.2 / react-db 0.4.1 / query-db-collection 1.2.15 / offline-transactions 1.0.56 behind one app-owned data module, skip the 705 KB gz OPFS persistence, and re-evaluate at 1.0.
- Rule out: Zero (rejects offline writes; needs Postgres), LiveStore 0.4.0 (Effect 3 peer; Effect 4 build is a dev prerelease), Jazz (2.0 alpha), Automerge (1.1 MB gz wasm, CRDT unnecessary), Replicache (maintenance mode; still needs the same backend).

## Decisions surfaced

- Rendering model: switch to Start SPA mode (or `defaultSsr: false`) so a static shell exists for offline navigation, versus keeping SSR and caching rendered HTML. SPA mode is simpler for a single-user app behind Access, but it changes first-load behaviour and requires the #7740 workaround on Cloudflare.
- Build vs buy for offline writes: a ~200-line app-owned IndexedDB outbox + Durable Object (full control, no beta dependency, you own the edge cases) versus adopting TanStack DB + offline-transactions pinned at pre-1.0 (leader election, backoff and rollback for free, but breaking minors and open offline bugs before a fixed Dec 6 deadline).
- Scope of offline writes: checklist ticks and notes only (trivial per-field LWW) versus full schedule restructuring offline (reordering/moving Activities across Days needs a deliberate conflict model or a 'schedule edits are online-only' rule).
- Cross-device freshness: sync on open/focus/reconnect only, or real-time push via a Durable Object WebSocket. The latter adds a connection lifecycle to keep reliable on a phone in Japan.
- Cloudflare Access policy: raise application and global session durations to one month so the PWA does not hit an expired session mid-trip, and decide whether cached trip data must remain readable after logout/expiry (affects whether the SW serves the shell without a valid session).
- Target device for offline: iOS Safari as a Home Screen web app (best-effort storage, persist() heuristics) versus Android Chrome. This decides which platform gets the pre-trip offline cold-start test.
- Server store for the sync backend: a single SQLite-backed Durable Object (transactional, one object for one user) versus D1. DO fits the single-user model and the WebSocket option; D1 is simpler if you never want push.
- Whether to add serwist as a runtime dependency inside the SW (about 16 KB gz, mature caching strategies) or hand-write the caching logic with zero dependencies for a narrower offline reader.
