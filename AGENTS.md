# AGENTS.md

<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Task Completion Requirements

- `vp check` must pass before considering tasks completed.
- `vp run typecheck` and `vp test` must also pass. Effect diagnostics follow the policy in `tsconfig.effect.json` and surface in both gates: `vp check` lints with the `@effect/tsgo`-patched Oxlint, whose `effecttsgo/*` rule severities `vite.config.ts` derives from that file, and `vp run typecheck` runs the patched `tsc` (the `prepare` script applies both patches). Change a severity only in `tsconfig.effect.json`. Error-severity Effect diagnostics fail the gates; warnings and suggestions print without failing — do not ignore new ones. The Oxlint patch only applies when `@effect/tsgo` supports the exact `oxlint`/`oxlint-tsgolint` versions `vite-plus` pins (see its README "Supported Package Versions") — bump them together.
- Use `vp test` for the built-in Vite+ test command and `vp run test` when you specifically need the `test` package script.
- CI (`.github/workflows/ci.yml`) runs these three gates and `vp run build` on every pull request and push to `main`. Run `vp run build` too after changing what browser code imports.

## Enforced rules

These rules fail a gate, and each failure names its fix. Follow the message.

| Rule                                                                                                                          | Enforced by                                                                                                                                                                                                                 | Gate                       |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Browser code value-imports only `Predicate`, `Data` and `Match` from `effect`, and `import type` from `@/trip/domain/domain*` | `no-restricted-imports` for browser files (`tools/oxlint/repo/restricted-imports.ts`); for imports through a shared module, `checkClientBundle` (`scripts/check-client-bundle.ts`) on the client and service worker bundles | `vp check`; `vp run build` |
| No Radix-based components and no `sonner`                                                                                     | `no-restricted-imports`                                                                                                                                                                                                     | `vp check`                 |
| Nav marks the current page with Link's `activeOptions`/`activeProps`, not `useMatchRoute`                                     | `no-restricted-imports`                                                                                                                                                                                                     | `vp check`                 |
| A split module's sibling never imports its entry                                                                              | `repo/no-split-module-entry-import` (`tools/oxlint/repo/`)                                                                                                                                                                  | `vp check`                 |
| `keptDataVersion` is bumped when a kept query's key or data shape changes                                                     | `src/trip/client/kept-data-version.test.ts`                                                                                                                                                                                 | `vp test`                  |
| `wrangler.jsonc` matches `cloudflare.config.ts`, and `worker-configuration.d.ts` matches `vp run cf-typegen`                  | `scripts/check-cloudflare-config.ts`                                                                                                                                                                                        | `vp test`                  |
| The display font holds exactly `src/fonts/display-strings.ts` plus ASCII                                                      | `scripts/check-display-font.ts`                                                                                                                                                                                             | `vp test`                  |
| `effect`, `@effect/vitest` and every `@effect/sql-*` driver share one exact version                                           | `scripts/check-effect-versions.ts`                                                                                                                                                                                          | `vp test`                  |

A new rule that code can check belongs in this table, enforced by the highest of: a type, a lint rule or build check whose message names the fix, then a test. Keep prose for rules that need judgment.

## Project Snapshot

Japan Trip December 2026 is a webapp for the user, Phillip, to plan his trip to Japan in December 2026.

This project uses [TanStack Start](https://tanstack.com/start/latest).

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Code Style

### Reference Material

Installed packages are the reference material for coding agents. Prefer examples and patterns from the source in `node_modules/` over generated guesses or web search results.

### Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

### Imports

Import from `src/` with the `@/` alias (`@/routes/...` for `src/routes/...`).

### Trip modules

`src/trip` has one folder per service (`trip`, `trip-store`, `schedule-store`, `itinerary`, `detail-tiles`, `location-links`), plus `domain`, `catalogue` and `client` for what they share. A new module goes in the folder of the service that owns it, never loose in `src/trip`.

### Splitting a module

A module over the pre-commit token limit splits into `<Module>.<area>.ts` siblings by Trip area: Itinerary, Schedule, Stays, Notes, Checklist, Activities and Detail tiles. One more sibling holds the pieces several areas share. The Trip service also keeps the checks its writes share in `Trip.guards.ts`, and its whole interface, every method with its doc comment, in `Trip.contract.ts`. The original path stays the entry point. It re-exports every sibling and keeps any area too small for its own file. Other modules import only the entry.

### Trip writes

Every Trip write to the Schedule store is its own input checks plus one call to the Schedule-write unit in `src/trip/trip/Trip.guards.ts`: `scheduleWrite`, which hands the write the Schedule's id, or `tripWrite` for a write to the Trip itself, such as the Trip note. A write's input names only what it changes, such as a Day, Stay or Activity; the unit supplies the one Schedule. In one transaction, which the unit owns, it replays a repeated operation id, runs the write and records its result. It turns storage failures into defects. Its target declares once whether it takes an operation id. `Trip.schedule-writes.test.ts` covers replay for every write that takes one, so feature tests leave replay to it.

### Cloudflare bindings

Dev and build use `cf dev` and `cf build`, which read `cloudflare.config.ts`. Deploy is `cf build`, then `cf deploy --prebuilt --mode production` ([ADR 0005](docs/adr/0005-use-cf-cli-for-dev-and-build.md)). `wrangler.jsonc` stays for `wrangler tail`, `wrangler secret put`, and `wrangler types`. Server code reads the typed environment with `import { env } from 'cloudflare:workers'`.

### Japanese display font

Shippori Mincho is subset to the curated strings in `src/fonts/display-strings.ts` plus ASCII. Render those strings with `DisplayJa`; any other Japanese text stays in the system font. The Home Screen icons draw 日本 from that font, so keep it in the list.

### UI components

shadcn/ui components in `src/components/ui/` are owned code on Base UI (vega preset).

Router integration (Base UI, so no `asChild`):

- To make a Base UI component navigate, pass a router `Link` as its `render` prop, e.g. `<SidebarMenuButton render={<Link to="/" />}>`.
- For a link styled as a button, use `ButtonLink` (`src/components/button-link.tsx`, built with `createLink`) rather than `Button`, which renders a `<button>`.
- Navigation entries live once in `src/components/app-nav.tsx`, shared by the tab bar and the sidebar.
- Dialogs, sheets and toasts portal to `body` above the `isolate` app root; don't add a portal-root element or a theme provider (the app is dark-only).

## Testing

Tests are colocated with the modules they exercise (`*.test.ts` under `src/`), written with `@effect/vitest` and run by `vp test`. Every test honours this contract:

- Drive behaviour only through a public seam: the Trip service, `runTripOperation` (for a Trip store operation's result or outcome) or the Access gate. What the store does when it starts, running the migrations and creating the Schedule, goes through store start, `startStore` (`@/trip/trip-store/store-start`), the call the Durable Object makes before its first request, and is read back through the Trip; a migration test may first write the older shape with SQL. Behaviour the browser lifecycle owns (mount, unmount, query-cache listeners), which no server seam reaches, goes through the exported React hook instead, rendered under `// @vitest-environment happy-dom` and asserting on what the hook returns and on the query cache. A hook test mocks out the server-function transport, `@/trip/trip/trip.functions`, and nothing else. A route loader's read goes through `loadQuery` (`@/trip/client/queries`) the same way. What the device keeps after the app closes goes through `keepCacheOnDevice` (`@/trip/client/device-cache`), the call that turns it on at app start. These tests may also replace the browser's IndexedDB, with `fake-indexeddb` or a wrapper of it that fails or answers late. The Detail tiles the service worker keeps go through `detailTileCache` (`@/offline/detail-tile-cache`), the cache it answers each Detail tile from; its tests substitute the network, the clock and IndexedDB.
- Assert only on returned values, described in glossary terms (`GLOSSARY.md`).
- Build the module under test for real; substitute only its dependencies (the Itinerary, Clock, SQL client, configuration, key-set transport, link resolver, Detail tiles archive) through layers or `Effect.provideService`.
- Read state back through the seam; tables, internal helpers and component internals stay uninspected.

Scripts under `scripts/` are the exception. Their tests run the script as its own process against temporary inputs (for the pre-commit size check, a throwaway Git repository) and assert only on its exit status and output. Each check script's test also runs it on the repository itself, which is how `vp test` enforces it. `kept-data-version.test.ts` is likewise a guard on a recorded fingerprint, not a behaviour test.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default mattpocock/skills label vocabulary. See `docs/agents/triage-labels.md`.

### Places

To add a place, station or line, such as a new Base Phillip asks for, follow `docs/agents/places.md`.

### Domain docs

This repo uses a single-context domain-doc layout. See `docs/agents/domain.md`.
