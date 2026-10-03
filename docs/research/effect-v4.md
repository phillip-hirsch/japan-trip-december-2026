# Idiomatic Effect v4 (effect@4.0.0-rc.118) usage in the japan-trip TanStack Start / Cloudflare Workers app

# Effect v4 fact sheet (effect@4.0.0-rc.118) — verified 2026-09-29

Legend: **[V]** = I verified it myself against the installed source, the npm registry, a runtime reproduction, or the cited official doc. **[U]** = plausible but not independently verified.

## 0. Versions and import paths

- Installed `effect` is `4.0.0-rc.118`, published 2026-09-28T02:08Z; npm dist-tags: `latest=3.22.2`, `rc=4.0.0-rc.118`. All `@effect/*` v4 packages must be pinned to the `rc` tag (`latest` still resolves to v3). **[V]** `node_modules/effect/package.json`; `pnpm view effect dist-tags time`
- rc.118 exports `./sql`, `./reactivity`, `./schema`, `./encoding`, `./testing` (no `./unstable/*`). PR #8354 "Move unstable Effect modules to top-level paths" merged 2026-09-22. Any snippet importing `effect/unstable/...` is stale. **[V]** `node_modules/effect/package.json` exports; `gh pr view 8354`
- The moved modules still carry `@stability unstable`: all of `src/sql/*`, `src/reactivity/*`, `src/encoding/{Yaml,Toml,Ini,Ndjson,Sse,SchemaBinary}`, `src/schema/{Model,VariantSchema,Schema*Compiler}`. `effect/testing` is not marked unstable. **[V]** grep `@stability unstable`
- Read `node_modules/effect/AGENTS.md` in full: prefer `Effect.gen` inline, `Effect.fn("name")` / `Effect.fnUntraced` for reusable functions, `return yield* new Err(...)`, `Schema.TaggedError` for errors, `Context.Service` + static `layer`, `ManagedRuntime` shared across handlers, `DateTime` instead of `Date`, `Predicate` instead of hand-written guards, `Schema` instead of manual parsing. The linked examples live under `node_modules/effect/ai-docs/src/...` (path exists). **[V]**

## 1. Schema

- Domain building blocks (all `node_modules/effect/src/Schema.ts`): `Struct` L3454, `Class` L14947, `Opaque` L6393, `brand` L5108, `fromBrand` L5119, `Literal` L2639, `Literals` L4852, `Union` L4808, `TaggedStruct` L6062, `TaggedUnion` L6328, `optional` L2379, `optionalKey` L2317, `NullOr` L4892, `NonEmptyString` L8816, `Int` L7652, `Finite` L7168, `makeFilter` L6507, `isPattern` L6630. **[V]**
- `Schema.brand` adds no runtime check (its own doc, L5090-5105: "does not add runtime checks"); put validation in `.check(...)` before `.pipe(Schema.brand(...))`. **[V]**
- Calendar-date brand pattern reproduced at runtime: `Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/), makeFilter(s => DateTime.make(`${s}T00:00:00Z`) round-trips via formatIsoDateUtc)).pipe(Schema.brand("IsoDate"))` accepts `2026-12-06`, rejects `2026-02-30` (DateTime.make silently normalises 2026-02-30 to 2026-03-02, so the round-trip check is required). **[V]** runtime probe
- Schema values are constructed with `.make(input)` (Bottom interface L218); `Schema.Class` instances via `new C({...})`. **[V]**
- Decoding: `decodeUnknownEffect` L1473, `decodeUnknownSync` L1811, `decodeUnknownExit` L1540, `decodeUnknownOption` L1606, `decodeUnknownResult` L1668, `decodeUnknownPromise` L1734, `encodeEffect` L1908, `encodeSync` L2233, `decodeTo` L5439, `fromJsonString` L9459, `UnknownFromJsonString` L9470. **[V]**
- Effect has no frontmatter parser, but `effect/encoding` ships `Yaml.parse(input: string): unknown` (`src/encoding/Yaml.ts` L598, `@stability unstable`). Runtime: `Yaml.parse("date: 2026-12-06\ncity: Tokyo\nn: 3")` gives `{"date":"2026-12-06","city":"Tokyo","n":3}` (date stays a string, good for the IsoDate brand); tab indentation throws `SyntaxError: Tabs cannot be used for YAML indentation`. Split the `---` block yourself, then `Schema.decodeUnknownEffect(Frontmatter)`. **[V]**
- Lint: `vite.config.ts` extends `@effect/tsgo/oxlint-presets` recommended (tsgo 0.46.1). `schema-number` is `warn` (prefer `Schema.Finite`/`Schema.Int`); `schema-sync-in-effect`, `prefer-typed-schema-decoder`, `run-effect-inside-effect`, `multiple-effect-provide` are `warn`; `floating-effect`, `missing-return-yield-star`, `missing-star-in-yield-effect-gen`, `class-self-mismatch`, `missing-effect-context/error`, `missing-layer-context`, `schema-opaque-instance-member` are `error`. **[V]** `node_modules/@effect/tsgo/oxlint-presets/recommended.json`

### Standard Schema interop

- `Schema.toStandardSchemaV1(schema, opts?)` (Schema.ts L1339) mutates and returns the same schema object (`std === S` is `true`) and adds `~standard`; validation is synchronous for sync schemas (returned a plain object, not a Promise). **[V]** runtime probe
- TanStack Router `validateSearch` (router-core 1.171.33 `src/router.ts` L2849-2853) checks `'~standard' in validateSearch` and throws `SearchParamError('Async validation not supported')` on a Promise, so search schemas must be sync and context-free. **[V]**
- TanStack Start server functions (start-client-core 1.170.33 `src/createServerFn.ts`): use `.validator(...)`; `inputValidator` is `/** @deprecated Use validator instead. */` (L512, L673, L827). `execValidator` awaits `validator['~standard'].validate(input)` (L898-899). **[V]**
- Server-function results are serialised by seroval 1.6.7 (`start-server-core 1.169.38/src/server-functions-handler.ts` imports `toCrossJSONAsync`/`toCrossJSONStream`). Runtime with that seroval: a `Schema.Class` instance FAILS (`Seroval Error (step: 1)`); a `Schema.Opaque` value or plain struct serialises (prototype is `Object.prototype`). So return Schema-encoded plain DTOs (or `Schema.Opaque`/`Struct`), not `Schema.Class` instances, from server functions. `createSerializationAdapter` exists at router-core `src/ssr/serializer/transformer.ts` L42 and is wired via `serializationAdapters` in `createStart.ts` if custom types must cross the wire. **[V]**
- Client cost: esbuild 0.28.1 `--bundle --minify` of one `toStandardSchemaV1(Struct)` + validate = 246,257 B min / 75,096 B gzip; `Effect.runSync(Effect.succeed(1))` alone = 85,046 B / 29,733 B gzip. Rolldown (`vp build`) numbers will differ, but the order of magnitude (~75 KB gzip once Schema reaches the browser) holds. **[V]** reproduced

## 2. Services / Layers / ManagedRuntime on Workers

- `Context.Service` (Context.ts L201), `Context.Reference` (L2035); `Layer.succeed` L1010, `sync` L1189, `effect` L1345, `unwrap` L1580, `mergeAll` L1649, `merge` L1702, `provide` L2005, `provideMerge` L2433; `Effect.fn` L22526, `fnUntraced` L22402, `gen` L2085, `provide` L11508, `provideService` L12449, `tryPromise` L1403. **[V]**
- `ManagedRuntime.make(layer, { memoMap? })` (ManagedRuntime.ts L285) exposes `runFork`, `runSyncExit`, `runSync`, `runCallback`, `runPromise(effect, { signal })`, `runPromiseExit`, `dispose`, `disposeEffect` (L132-227). The effect ai-docs example (`ai-docs/src/04_integration/10_managed-runtime.ts`) creates ONE module-scoped runtime shared by all handlers. **[V]**
- Reliability gotcha: `make` assigns `buildFiber` once (`if (!buildFiber) { buildFiber = Effect.runFork(Layer.buildWithMemoMap(...)) }`, L311-323) and never resets it on failure. Reproduced: a layer whose build fails once → three consecutive `runPromiseExit` calls all `Failure`, build attempted exactly once. Keep layer construction infallible and I/O-free, or dispose+recreate on build failure. **[V]**
- `Effect.runPromise` rejects with the raw error instance (a `Schema.TaggedError` arrived as `instanceof NotFound`, own keys `["_tag","id"]`). Use `runPromiseExit` at the server-function boundary and map known tags to `notFound()`/`redirect()`/typed results so raw errors and stacks don't cross the wire. **[V]** runtime probe; `Cause.isFailReason`, `Cause.pretty` exist **[U]** (line refs from Report B not re-checked)
- Cloudflare: `import { env } from "cloudflare:workers"` is usable at module scope since 2025-03-17, and Cloudflare's own TanStack Start guide uses it in server functions. But "Workers do not allow I/O from outside a request context" (env vars/secrets and DO stubs are fine at top level; KV/DO calls are not). **[V]** https://developers.cloudflare.com/changelog/post/2025-03-17-importable-env/ ; https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
- Cloudflare bindings page warns: on binding-only deploys isolates may be reused, so "anything you create [in global scope] might continue to exist despite making changes to any underlying bindings"; it recommends creating client instances per request. **[V]** https://developers.cloudflare.com/workers/runtime-apis/bindings/
- "Cannot perform I/O on behalf of a different request" applies to I/O objects (streams, Request/Response bodies) created in one request and used in another, typically when cached globally. It is on the errors page, not the limits page. **[V]** https://developers.cloudflare.com/workers/observability/errors/
- `request.signal` on incoming requests needs the `enable_request_signal` compatibility flag (no default-on date). `wrangler.jsonc` has `compatibility_date: 2025-09-02`, `compatibility_flags: ["nodejs_compat"]` only, and TanStack's `ServerFnCtx` exposes no `signal`, so request-abort → Effect interruption is not wired today. **[V]** https://developers.cloudflare.com/workers/configuration/compatibility-flags/ ; `wrangler.jsonc`
- `@effect/sql-d1` rc.118 `D1Client.make` only builds a `Cache` (capacity 200, TTL 10 min) and does no I/O, so building it per request is cheap. **[V]** npm pack, `src/D1Client.ts` L193-222

## 3. Typed errors

- `Schema.TaggedError` (Schema.ts L15491), `Schema.Error` (L15359), `Schema.ErrorInstance` (L8917 — Report B said L8852), `Schema.Defect()` (L8993); `Data.TaggedError` (Data.ts L1111), `Data.Error` (L1062), `Data.TaggedClass` (L91). `TaggedErrorClass` no longer exists (grep: 0 hits); PR #6732 "Rename Schema error constructors" merged 2026-08-04. **[V]**
- Both `Schema.TaggedError` and `Data.TaggedError` are yieldable (`return yield* new Err(...)` reproduced). Handlers: `Effect.catchTag` L4530 (accepts a tag array), `catchTags` L4723, `catch` (`catch_ as catch`, L4480), `catchReason` L4930, `catchReasons` L5125, `unwrapReason` L5347, `mapError` L6332, `orDie` L6579. **[V]**
- `Schema.Exit` L13177, `Schema.Result` L14544, `Schema.Cause` L10836 exist for typed failures crossing a wire. **[V]**

## 4. SQL

- `effect/sql` barrel: `Migrator`, `SqlClient`, `SqlConnection`, `SqlError`, `SqlModel`, `SqlResolver`, `SqlSchema` (`findAll` L35, `findNonEmpty` L68, `findOne` L123, `findOneOption` L157), `SqlStream`, `Statement`. `Model.Class` is in `effect/schema` (`src/schema/Model.ts`). **[V]**
- `Migrator.make` runs `sql.withTransaction(run)` (Migrator.ts L315) → unusable on D1. **[V]**
- `@effect/sql-d1@4.0.0-rc.118`: peer `effect ^4.0.0-rc.118`, dep `@cloudflare/workers-types ^5.20260926.1`; imports `effect/reactivity/Reactivity` (new paths, no `unstable`). Header: "Transactions, streaming queries, and `updateValues` are not supported"; `transactionAcquirer = Effect.die("transactions are not supported in D1")` (L323); `batch` executes "as a single atomic D1 batch" (L63-78); config `prepareCacheSize`/`prepareCacheTTL` (L112-113). **[V]** `pnpm view`, npm pack
- Cloudflare D1: "Batched statements are SQL transactions … aborts or rolls back the entire sequence"; prepared statements can be reused inside a batch. **[V]** https://developers.cloudflare.com/d1/worker-api/d1-database/
- `@effect/sql-sqlite-do@4.0.0-rc.118`: peer `effect ^4.0.0-rc.118`; config `db?: SqlStorage`, `storage?: DurableObjectStorage` (pass `storage` for transactions via `storage.transaction()` and migrations via `SqliteMigrator`); no `unstable` imports. **[V]** npm pack
- Whether cached `D1PreparedStatement`s in a module-scoped D1Client are safe across Worker requests is not documented either way. **[U]**

## 5. DateTime / Asia/Tokyo (all outputs reproduced)

- No PlainDate/Temporal type in Effect; keep all-day dates as the branded `IsoDate` string. **[V]** (grep)
- `DateTime.makeZonedUnsafe("2026-12-06", { timeZone: "Asia/Tokyo", adjustForTimeZone: true })` → `2026-12-06T00:00:00.000+09:00[Asia/Tokyo]` = `2026-12-05T15:00:00.000Z`. `makeZoned` (L792) is the Option-returning variant. **[V]**
- "Today in Japan": `DateTime.now` (L881, Clock-based) → `setZoneNamedUnsafe(now, "Asia/Tokyo")` (L1367) → `formatIsoDate` (L4398). For 2026-12-05T16:30Z: Tokyo `2026-12-06`, UTC `2026-12-05`. Confirmed controllable by `TestClock.setTime` under @effect/vitest. **[V]**
- `DateTime.format(z, { locale: "ja-JP", dateStyle: "full" })` → `2026年12月6日日曜日`; `Duration.toDays(DateTime.distance(z, DateTime.add(z, { days: 14 })))` → 14. `startOf` L3694, `layerCurrentZoneNamed` L4569, `nowInCurrentZone` L2836, `withCurrentZoneNamed` L2762. **[V]**
- `Schema.DateTimeZonedFromString` (L11557) round-trips `2026-12-06T10:35:00.000+09:00[Asia/Tokyo]` — use for flights/reservations. Pitfall: `Schema.DateTimeUtcFromString` (L11233) reads `"2026-12-06"` as UTC midnight = `09:00+09:00` Tokyo. **[V]**

## 6. Testing

- `@effect/vitest@4.0.0-rc.118` peers: `effect ^4.0.0-rc.118`, `vitest >=5.0.0 <6.0.0`. vite-plus 1.0.0 depends on `vitest 5.0.1` exactly; `vite-plus/test` is `export * from 'vitest'`. **[V]** `pnpm view`; `node_modules/vite-plus/package.json`, `dist/test/index.js`
- Independently reproduced: temp project with effect + @effect/vitest rc.118 + vitest 5.0.1 → pnpm resolved a single `vitest@5.0.1`, `it.effect` with `TestClock.setTime` driving `DateTime.now` and `it.effect.prop([Schema.String])` both passed (RUN v5.0.1, 2 passed). Exports include `it`, `it.effect`, `it.live`, `it.effect.each`, `it.effect.prop`, `layer`, `flakyTest`, `assert`, `describe`, `vi`. **[V]**
- `effect/testing`: `TestClock` (`adjust` L507, `setTime` L544), `TestConsole`, `TestSchema`. **[V]**
- `@cloudflare/vitest-pool-workers@0.22.0` peers `vitest ^4.1.0` → incompatible with Vite+'s Vitest 5. **[V]** `pnpm view`
- `@effect/sql-sqlite-node` rc.118 exists (rc tag) as a `node:sqlite`-based stand-in for SQLite-dialect tests. **[V]** version; `node:sqlite` import **[U]**

## 7. Effect in React

- `effect/reactivity` exports Atom (`make` L464, `runtime` L956, `fn` L1348, `family` L1602, `kvs` L2852, `searchParam` L2918, `withServerValue` L3316), AtomRegistry, AsyncResult, Hydration, AtomRef, AtomRpc, AtomHttpApi, Reactivity — all `@stability unstable`. **[V]**
- `@effect/atom-react@4.0.0-rc.118` peers: `react >=19 <20`, `effect ^4.0.0-rc.118`, `scheduler >=0.25.0 <0.28.0`; `react-dom@19.3.0` depends on `scheduler ^0.28.0` (project has scheduler 0.28.0) → declared peer conflict today. **[V]** `pnpm view`
- rc.118 release notes include several AtomRegistry/Atom.swr bug fixes ("Fix missed updates through stale AtomRegistry nodes…"), i.e. the module is still actively being stabilised. **[V]** `gh release view effect@4.0.0-rc.118`

## Project-config gaps surfaced

- `AGENTS.md` references `tsconfig.effect.json`, which does not exist; `tsconfig.json` sets `@effect/language-service` `diagnostics: false`. The `vp run typecheck` gate therefore may not enforce the Effect diagnostics AGENTS.md describes. **[V]** `ls tsconfig*.json`
- `tsconfig.json` `types: ["vite/client"]` only — `cloudflare:workers` typings need `wrangler types` output added. **[V]**

## Disagreements between researchers

- Runtime lifetime on Workers. Report A: build a request-scoped ManagedRuntime (or Effect.provide per op) and avoid global runtimes holding binding-derived clients. Report B: one module-scoped ManagedRuntime per isolate, taking env.DB from `cloudflare:workers`. Resolution: both are partially right. Effect's own ai-docs (04_integration/10_managed-runtime.ts) and the AGENTS.md use one shared runtime, and `env` from `cloudflare:workers` is officially supported at module scope; but Cloudflare's bindings page explicitly warns that isolates can be reused after binding-only deploys and that binding-derived clients in global scope may go stale, recommending per-request client instances. Also, ManagedRuntime caches a failed layer build forever (reproduced). Recommended hybrid: module-scoped ManagedRuntime for binding-independent, infallible layers (config, CurrentTimeZone, logging, pure services); build binding-dependent layers (D1Client) per request with `Effect.provide(D1Client.layer({ db: env.DB }))` inside the run — D1Client.make does no I/O (verified), so the cost is negligible, and this also sidesteps the undocumented question of sharing cached D1PreparedStatements across requests.
- @effect/vitest, @effect/sql-d1, @effect/sql-sqlite-do, @effect/atom-react versions/peers. Report A could not reach the registry and marked them low-confidence with 'pre-rc.118 import paths' worries; Report B verified them. Resolution: independently re-verified with `pnpm view` and `npm pack` — all four exist at 4.0.0-rc.118 under the `rc` tag with peer `effect ^4.0.0-rc.118`; the D1 and DO-SQLite sources import the new `effect/reactivity/...` paths (no `effect/unstable`). Report A's concern is resolved in Report B's favour.
- @effect/vitest compatibility with Vite+. Report A listed a no-dependency fallback and flagged peers as unverified; Report B ran it under `vp test`. Resolution: re-ran an `it.effect` + TestClock + `it.effect.prop` suite against vitest 5.0.1 (the exact version vite-plus 1.0.0 pins and re-exports) — passes. @effect/vitest is safe to add.
- Schema.Class vs Struct/Opaque for server-function return values. Only Report B raised the seroval incompatibility. Resolution: reproduced with seroval 1.6.7 (the version linked by start-server-core 1.169.38): `Schema.Class` instance fails with 'Seroval Error (step: 1)', `Schema.Opaque` and plain structs serialise. Report B is correct; do not return Schema.Class instances from server functions (note the effect ai-docs Hono example does use Schema.Class, but Hono serialises via JSON.stringify, not seroval).
- Line-number and path details. Report A cited Schema.Error at Schema.ts:1908 (that is `encodeEffect`) and Report B cited `ErrorInstance` at L8852 (actual L8917). Report B placed 'Cannot perform I/O on behalf of a different request' on the Workers limits page; it is on the errors page. None of these change the substance.
- Testing fallback without @effect/vitest (Report A). Not a disagreement per se, but unnecessary now that compatibility is verified; `effect/testing` TestClock/TestSchema remain useful with either approach.

## Recommendation

Use Effect v4 on the server and in a shared, dependency-light domain module; keep the browser on plain React + TanStack Router.

2026-10-03: The allowed browser imports are now specified in [AGENTS.md — Effect in the browser](../../AGENTS.md#effect-in-the-browser).

1. Domain module (shared): `Schema.Struct`/`Schema.Opaque` records, `Schema.Literals` enums, branded ids and a branded `IsoDate` calendar-date string with a real round-trip check before `Schema.brand`, `Schema.TaggedError` for all errors (never `TaggedErrorClass`), `Schema.Finite`/`Int` instead of `Schema.Number`. Wrap route-search and server-fn input schemas once with `Schema.toStandardSchemaV1` and pass to `validateSearch` (sync only) and `createServerFn().validator(...)` (`inputValidator` is deprecated). Return Schema-encoded plain DTOs or `Schema.Opaque` values from server functions — never `Schema.Class` instances (seroval rejects them). Parse markdown frontmatter with `effect/encoding` `Yaml.parse` then `Schema.decodeUnknownEffect`; no extra YAML dependency needed. Accept that any client-side Schema use costs ~75 KB gzip and keep it to validation only.

2. Server: `Context.Service` classes with static layers, `Effect.fn("Service.method")`, `return yield*` for errors. One module-scoped `ManagedRuntime.make(AppLayer)` holding only binding-independent, infallible, I/O-free layers (a failed build is cached for the isolate's lifetime). Build binding-dependent layers per request: `runtime.runPromiseExit(program.pipe(Effect.provide(D1Client.layer({ db: env.DB }))))` with `env` from `cloudflare:workers` — cheap, and it respects Cloudflare's per-request-client guidance. Wrap every server function in a single `runServerFn` helper that uses `runPromiseExit` and maps known tags to `notFound()`/`redirect()`/typed results and everything else to a generic Error, so raw errors and stacks never reach the client. Use `Effect.provideService` for per-request values (Request, Access identity).

3. Persistence: `effect/sql` + `@effect/sql-d1@4.0.0-rc.118` (pin the `rc` tag for every `@effect/*` package). Use `batch` for atomic writes; do not use `effect/sql` `Migrator` (needs transactions) — use `wrangler d1 migrations`. Only reach for `@effect/sql-sqlite-do` if a Durable Object becomes necessary.

4. Dates: all-day dates as `IsoDate` strings; timed events as `Schema.DateTimeZonedFromString` in `Asia/Tokyo`; "today in Japan" = `DateTime.now` → `setZoneNamedUnsafe(..., "Asia/Tokyo")` → `formatIsoDate`. Never `DateTimeUtcFromString` for Tokyo calendar dates.

5. Tests: add `@effect/vitest@4.0.0-rc.118` (verified against Vitest 5.0.1, which Vite+ 1.0.0 pins); test services by swapping layers (in-memory repo or `@effect/sql-sqlite-node`). Skip `@cloudflare/vitest-pool-workers` (needs Vitest 4).

6. Skip `effect/reactivity` Atom and `@effect/atom-react` for now: unstable, a scheduler peer conflict with React 19.3, still receiving correctness fixes in rc.118, and it would duplicate Router loaders. Revisit `Atom.kvs` only if offline-persisted client state becomes a requirement.

Housekeeping: fix or create the `tsconfig.effect.json` that AGENTS.md references (or update AGENTS.md), and add `wrangler types` output to `tsconfig.json` `types` before importing `cloudflare:workers`.

## Decisions surfaced

- Runtime lifetime on Workers: accept the recommended hybrid (module-scoped runtime for binding-independent services, per-request D1 layer), or go fully module-scoped for simplicity and accept Cloudflare's documented stale-binding risk on binding-only redeploys plus the undocumented cross-request prepared-statement question.
- Persistence engine: D1 (atomic `batch` only, no transactions, migrations via wrangler) vs Durable Object SQLite (real transactions and Effect migrations, but a DO hop and a second runtime context). This hinges on whether any trip mutation needs read-then-write atomicity beyond a batch.
- How much Effect ships to the phone: allowing Schema in the browser (route search validation, client-side decoding) costs ~75 KB gzip; the alternative is hand-written or lighter validators on the client and Effect only on the server. Decide before writing the first `validateSearch`.
- Error contract across the server-function boundary: a generic 'throw Error / notFound()' mapping (simplest, opaque to the client) vs a typed serialisable result (`Schema.Result`/`Schema.Exit`) so the UI can branch on failure tags during reconnects and partial failures.
- Offline expectations for the trip companion: offline reading (loaders + service worker/cache) vs offline editing (would justify revisiting `Atom.kvs` or another local-first store later). This decides whether the 'skip Atom' recommendation is permanent or provisional.
- Request-abort handling: whether to enable the `enable_request_signal` compatibility flag and plumb `getRequest().signal` into `runPromiseExit(effect, { signal })` so client cancellations interrupt Effect work, or ignore cancellation for a single-user app.
- Content source of truth: markdown-with-YAML-frontmatter files decoded via `effect/encoding` Yaml (unstable API, no extra dependency) vs storing itinerary content in D1 and treating markdown as import-only.
- Repository hygiene: reconcile AGENTS.md's reference to a non-existent `tsconfig.effect.json` and decide which Effect diagnostics the typecheck gate should actually enforce.
