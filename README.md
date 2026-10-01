# Japan · December 2026

A private companion for Phillip's fourth trip to Japan: 14 nights, arriving Sunday, December 6, 2026 and flying home Sunday, December 20. What runs today is a dark, mobile-first comparison of the candidate itineraries. From there the plan is his own schedule: notes, a checklist, and pages he can still read on a train with no signal.

## Status

The [spec](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/1) splits the work into four phases. They ship in order.

**Phase 1 — compare the itineraries.** This is what the repo runs today. Home counts whole days until midnight on December 6 in Tokyo. Four itineraries, Option 1 through Option 4, each show their stays, all 15 days, and the anchors every option has to respect: arrival, the Shigeharu visit on the morning of December 11, the birthday on December 15, and departure. `/options` lines them up on the same rows and on one map. Each itinerary page has its own map. Train moves follow the real rail lines when the route is known. A move with no route is a straight line between the places it joins.

Two Phase 1 issues are still open: prerendering the comparison and itinerary pages ([#13](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/13)), and deploying the Worker behind Cloudflare Access ([#14](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/14)).

**Phase 2 — choose, then keep a schedule.** Choosing an itinerary copies it into a personal schedule. A later revision of that itinerary leaves the copy as it was. This phase adds notes, a checklist of things to book or confirm, and a Today view on Home during the trip. The schedule will live in one SQLite Durable Object near Japan ([ADR 0001](docs/adr/0001-durable-object-sqlite-for-schedule-data.md)).

**Phase 3 — match the bookings.** Activities on a day, hotel details on a stay, splitting and reshaping stays, pins placed from a maps link, and a full-screen map of the schedule.

**Phase 4 — read it offline.** An app on the iPhone Home Screen. The schedule, Today, the checklist, notes, and a Japan overview map stay readable with no connection. Editing waits until the signal is back.

Phases 2–4 are specified, and still on the board.

## Stack

- [TanStack Start](https://tanstack.com/start) and React 19, with file routes in `src/routes`.
- [Tailwind CSS](https://tailwindcss.com/) 4. One dark theme.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/), via the Cloudflare Vite plugin and Wrangler. The Worker entry is `src/server.ts`.
- [MapLibre GL](https://maplibre.org/) for the itinerary and comparison maps, on [OpenFreeMap](https://openfreemap.org/)'s dark style. The MapLibre worker ships with the app.
- [Effect](https://effect.website/) 4 for the Trip service and the Access gate. Tests use `@effect/vitest`.
- [Vite+](https://viteplus.dev/) (`vp`) for dev, build, format, lint, typecheck, and tests.
- Owned [shadcn/ui](https://ui.shadcn.com/) components on Base UI.
- Headings and a curated set of Japanese words use a subset of Shippori Mincho, served from the app.

## Local development

[Vite+](https://viteplus.dev/) (`vp`) is how you install, run, and check the app.

```bash
vp install
vp run dev
```

`vp run dev` is the dev script: `vp dev` on port 3000. Open http://localhost:3000.

Local requests pass Wrangler's Access simulation. `.dev.vars` supplies `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ALLOWED_EMAIL`, and `ACCESS_DEV_SIMULATION` for `vp dev` and `vp preview`.

```bash
vp check           # format, lint, and typecheck
vp run typecheck   # patched tsc, including Effect diagnostics
vp test            # tests colocated under src/
```

`vp build` produces the Worker bundle. `vp preview` serves that build locally, with the same Access simulation.

## Deploy

`vp run deploy` builds the Worker and runs `wrangler deploy`. The Worker is named `japan-trip-december-2026`. Deploy needs a Wrangler login.

Cloudflare Access is the sign-in: an email one-time PIN for a single allowed address. `src/server.ts` checks that assertion before TanStack Start sees the request. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ACCESS_ALLOWED_EMAIL` are plain Worker variables. Until the Access application exists and the team domain and audience are set, a deployed Worker refuses every request. That first deploy is [#14](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/14). The reasoning is [ADR 0002](docs/adr/0002-cloudflare-access-instead-of-in-app-login.md).

The repository is public on purpose. Itineraries and these docs belong here. A schedule, checklist, notes, and booking details stay in storage once Phase 2 exists, and out of git. See [ADR 0003](docs/adr/0003-itineraries-are-repo-content.md).

## Where to look

- `src/routes` — Home (`/`), the comparison (`/options`), and one itinerary (`/options/$optionNumber`).
- `src/trip` — the Trip domain, Options 1–4, and the rail geometry the maps draw.
- `src/access` — the Access gate.
- `src/components` — page UI, the maps, and the nav shared by the phone tab bar and the desktop sidebar.
- [`CONTEXT.md`](CONTEXT.md) — the glossary the code uses (Trip, Itinerary, Schedule, Stay, and the rest).
- [`docs/adr`](docs/adr) — why storage, Access, and itinerary content are shaped this way.
- [`docs/itinerary.md`](docs/itinerary.md) — the source write-up the four options were converted from.
- [`docs/agents/itineraries.md`](docs/agents/itineraries.md) — how to add or revise an itinerary.

Issues labelled [`ready-for-agent`](https://github.com/phillip-hirsch/japan-trip-december-2026/issues?q=is%3Aissue+is%3Aopen+label%3Aready-for-agent) are specified enough for an agent to pick up. `ready-for-human` means a deploy or a check on the phone.
