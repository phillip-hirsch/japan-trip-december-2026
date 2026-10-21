---
title: Effect and Trip Conventions
model: gpt-6-1-sol
reasoning: medium
input: incremental
tools:
  - browse_code
  - git_tools
  - modify_pr
include:
  - 'src/**/*.ts'
  - 'src/**/*.tsx'
  - 'wrangler.jsonc'
  - 'cloudflare.config.ts'
exclude:
  - '**/*.gen.ts'
maxBudgetPerRun: 1
maxBudgetPerPR: 3
conclusion: neutral
---

# Effect and Trip conventions review

Review changed TypeScript under `src/` for the conventions below. Authors read the same rules in `AGENTS.md` (Effect in the browser, Imports, Trip modules, Splitting a module, Trip writes, Cloudflare bindings); keep the two in step. Review only the lines the PR changed; older code that predates a rule is not a finding. Oxlint already enforces the `anti-slop` and `effecttsgo` rules in `vite.config.ts`, so do not repeat what those catch.

## Browser bundle

Schema and the Effect runtime cost about 75 KB gzip in the browser bundle, so these rules apply to browser code:

- Browser code is everything under `src/components/` (including the owned shadcn/ui components in `src/components/ui/`), `src/routes/`, `src/hooks/`, `src/offline/`, `src/trip/client/` and `src/lib/`, the client entry modules `src/router.tsx` and `src/start.ts`, and any module they value-import. `import type` is erased at build time, so a module reached only through type imports is not browser code.
- Not browser code: `src/server.ts` (the Worker entry); tests (`*.test.ts`) and the test-support modules only tests import (`*testing.ts`, such as `src/trip/client/editor-testing.ts`); and `src/trip/trip/trip.functions.ts`, the boundary. TanStack Start strips that file's inline validators and handlers from the client build, so it may value-import `effect`, the domain schemas and server-only modules.

- Flag a value import from `effect` other than `Predicate`, `Data` or `Match` in browser code. `import type` of anything is fine.
- Flag a value import of `@/trip/domain/domain` in browser code; it must be `import type`.
- Flag browser code that imports a server-only module (`*.server.ts`, `src/trip/trip/runtime.server.ts`, the Schedule or Trip store) other than through the server functions in `src/trip/trip/trip.functions.ts`.

## Imports and placement

- Every import of a module under `src/` uses the `@/` alias, including same-folder siblings (`@/trip/trip/Trip.shared`, not `./Trip.shared`).
- `src/trip` has one folder per service (`trip`, `trip-store`, `schedule-store`, `itineraries`, `detail-tiles`, `location-links`) plus `domain`, `catalogue` and `client`. Flag a new module loose in `src/trip` or in a folder whose service does not own it.

## Split modules

A module over the pre-commit token limit splits into `<Module>.<area>.ts` siblings by Trip area (Itinerary, Schedule, Stays, Notes, Checklist, Activities, Detail tiles), with one sibling for shared pieces. The Trip service also keeps `Trip.guards.ts` and `Trip.contract.ts`.

- The original path stays the entry and re-exports every sibling. Flag a new sibling the entry does not re-export.
- Flag a module outside the split that imports a sibling instead of the entry.
- Flag a sibling that imports its own entry; that cycle fails when the modules load.
- A new Trip method has its interface and doc comment in `Trip.contract.ts`.

## Trip writes

Every Trip write to the Schedule store is its own input checks plus one call to `scheduleWrite`, or `tripWrite` for a write that names no Schedule, from `src/trip/trip/Trip.guards.ts`.

- Flag a write that opens its own transaction, checks that the Schedule is current itself, records or replays an operation id itself, or writes to the Schedule store outside that unit.
- Flag a write that catches storage failures and turns them into typed errors; the unit turns them into defects.
- A new write is added to `src/trip/trip/Trip.schedule-writes.test.ts`, which covers the unit for every write; its feature test then needs just one Schedule changed case.

## Services, functions and errors

- Services are `Context.Service` classes keyed `'japan-trip/<top-level folder under src>/<ClassName>'`, such as `'japan-trip/trip/Trip'` and `'japan-trip/access/AccessGate'`, with the layer the module provides as a static `layer` on the class. Flag a different key shape or a service defined some other way.
- A service operation that names a span, through `Effect.fn` or `Effect.withSpan`, names it `'Service.operation'`, such as `'Trip.writeDayNote'`. Flag a name that does not match the operation. Plain effect-returning functions and `Effect.fnUntraced` helpers are fine.
- Domain failures are `Schema.TaggedError` classes.
- Server code reads Cloudflare bindings with `import { env } from 'cloudflare:workers'`. Flag other ways of reaching the Worker environment.
- `wrangler.jsonc` and `cloudflare.config.ts` declare the same bindings. When a PR changes the bindings in one, flag it unless the other matches and the PR also regenerates `worker-configuration.d.ts`.

## Change discipline

- Every new or broadened directive that disables a lint, type-checker or static-analysis diagnostic needs an adjacent comment explaining why. A missing one is a finding.
- A new or changed behaviour needs a test through a public seam: the Trip service, `runTripOperation` or the Access gate. Behaviour the browser lifecycle owns (mount, unmount, query-cache listeners) is tested through the exported React hook, and a route loader's read through `loadQuery` from `@/trip/client/queries`. Do not require tests for mechanical refactors or import-only changes.

## Reporting

Report only violations introduced by changed lines. Post each as a precise inline comment on the smallest relevant range, name the rule, and state the expected fix. Do not comment on style preferences or untouched legacy code.

When there are no findings, make the entire final response exactly `All clear` on one line with nothing else.
