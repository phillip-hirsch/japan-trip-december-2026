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

### Cloudflare bindings

`worker-configuration.d.ts` is generated: run `vp run cf-typegen` after every `wrangler.jsonc` change and commit the result. Server code reads the typed environment with `import { env } from 'cloudflare:workers'`.

### Japanese display font

Shippori Mincho is subset to the curated strings in `src/fonts/display-strings.ts` plus ASCII. Render those strings with `DisplayJa`; any other Japanese text stays in the system font. After changing the list, run `vp run subset-display-font` (needs `uv`) and commit the regenerated woff2.

### UI components

shadcn/ui components in `src/components/ui/` are owned code on Base UI (vega preset). Never add Radix-based components or `sonner`; use the `toast` component for notifications.

Router integration (Base UI, so no `asChild`):

- To make a Base UI component navigate, pass a router `Link` as its `render` prop, e.g. `<SidebarMenuButton render={<Link to="/" />}>`.
- For a link styled as a button, use `ButtonLink` (`src/components/button-link.tsx`, built with `createLink`) rather than `Button`, which renders a `<button>`.
- Navigation entries live once in `src/components/app-nav.tsx`, shared by the tab bar and the sidebar. Mark the current page with Link's own active state (`activeOptions`/`activeProps`), not a separate `useMatchRoute` check.
- Dialogs, sheets and toasts portal to `body` above the `isolate` app root; don't add a portal-root element or a theme provider (the app is dark-only).

### Pinning

`effect`, `@effect/vitest` and every Effect SQL driver share one exact version, bumped together. `@effect/tsgo` is versioned independently, against the TypeScript and Oxlint versions it supports.

## Testing

Tests are colocated with the modules they exercise (`*.test.ts` under `src/`), written with `@effect/vitest` and run by `vp test`. Every test honours this contract:

- Drive behaviour only through a public seam: the Trip service or the Access gate.
- Assert only on returned values, described in glossary terms (`CONTEXT.md`).
- Build the module under test for real; substitute only its dependencies (Itinerary catalogue, Clock, SQL client, configuration, key-set transport, link resolver) through layers.
- Read state back through the seam; tables, internal helpers and component internals stay uninspected.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default mattpocock/skills label vocabulary. See `docs/agents/triage-labels.md`.

### Itineraries

To add or revise an Itinerary from gpt-6-astra's markdown, follow `docs/agents/itineraries.md`.

### Domain docs

This repo uses a single-context domain-doc layout. See `docs/agents/domain.md`.
