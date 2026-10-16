# Japan, December 2026

Private web app for Phillip's fourth trip to Japan, December 6–20, 2026 (14 nights).

## Status

Four phases, in order. Spec: [issue #1](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/1).

**Phase 1, compare.** Live at https://japan-trip-december-2026.phillip-b52.workers.dev, behind Cloudflare Access. Home counts whole days until midnight on December 6 in Tokyo. Options 1–4 show their stays, all 15 days, and the anchors: arrival, the Shigeharu visit on the morning of December 11, the birthday on December 15, and departure. `/options` compares them on the same rows and on one map. Each itinerary page has its own map. Train moves follow the real rail lines when the route is known. A move with no route is a straight line between the places it joins. `/options` and every itinerary page are prerendered; Home stays dynamic.

**Phase 2, schedule.** Live. Choosing copies an itinerary into a schedule that later revisions leave alone. The schedule has a page for each day, stay notes, day notes, a trip note, and a checklist. During the trip, Home shows today's page. It's stored in a SQLite Durable Object near Japan ([ADR 0001](docs/adr/0001-durable-object-sqlite-for-schedule-data.md)). Devices catch up when the app opens, regains focus, or reconnects. Before the Trip, follow the [pre-trip routine](docs/pre-trip-routine.md).

**Phase 3, bookings.** Not built. Activities, hotel details, stay edits, pins from map links, and a full-screen map.

**Phase 4, offline.** Not built. iPhone Home Screen app that reads the schedule, Today, checklist, notes, and a Japan map with no connection.

## Stack

- [TanStack Start](https://tanstack.com/start) and React 19. Routes in `src/routes`.
- [Tailwind CSS](https://tailwindcss.com/) 4, dark only.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/). `cf dev`, `cf build`, and `cf deploy --prebuilt` read `cloudflare.config.ts`. Wrangler stays for live logs, single secrets, and types ([ADR 0005](docs/adr/0005-use-cf-cli-for-dev-and-build.md)). Entry is `src/server.ts`.
- [MapLibre GL](https://maplibre.org/) with [OpenFreeMap](https://openfreemap.org/) dark tiles. The MapLibre worker is bundled.
- [Effect](https://effect.website/) 4 for the Trip service and the Access gate. Tests use `@effect/vitest`.
- [Vite+](https://viteplus.dev/) (`vp`).
- shadcn/ui on Base UI.
- Shippori Mincho subset for headings and a few Japanese strings.

## Local development

```bash
vp install
vp run dev
```

`vp run dev` runs `cf dev` on port 3000. Open http://localhost:3000.

`.dev.vars` is git-ignored. `vp install` creates it from `.dev.vars.example` when it's missing. `cf` loads `ACCESS_DEV_SIMULATION` from that file because `cloudflare.config.ts` declares it as a secret. The local value is `true`. The deployed Worker sets it to `false`, because `cf deploy` refuses to deploy while a declared secret is missing. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ACCESS_ALLOWED_EMAIL` are text bindings in `cloudflare.config.ts`, with the same values in `wrangler.jsonc`. `.dev.vars` does not override them.

```bash
vp check           # format, lint, and typecheck
vp run typecheck   # patched tsc, including Effect diagnostics
vp test            # tests under src/
```

`vp run build` runs `cf build`. It builds the Worker and prerenders `/options` and every Itinerary page in the catalogue (`scripts/prerender.ts`), fetching them through the preview's Access simulation. The build fails if a listed page's HTML is missing, if any HTML contains an email address, or if a page links to an Itinerary page that isn’t prerendered. `vp preview` serves that build with the same Access simulation.

## Deploy

`vp run deploy` runs `cf build`, then `cf deploy --prebuilt --mode production`, to https://japan-trip-december-2026.phillip-b52.workers.dev, the app's stable address. The Worker name is `japan-trip-december-2026`. That publishes the Build Output in `.cloudflare/output/v0`, including the prerendered pages and the TripStore SQLite export. You need `cf auth login`. Before the first `cf` deploy, run `vp exec wrangler secret put ACCESS_DEV_SIMULATION` and enter `false`. A dry run of the deploy command uploads nothing and does not check secrets. Live logs are `vp exec wrangler tail`. A single secret is `vp exec wrangler secret put`. Types are `vp run cf-typegen`.

Sign-in is Cloudflare Access, an email one-time PIN for one address. `src/server.ts` checks the assertion. Access is Worker-level: the team is `phillip-hirsch.cloudflareaccess.com`, the policy allows only phillip@350home.com, and the application and global sessions last one month. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ACCESS_ALLOWED_EMAIL` are text bindings in `cloudflare.config.ts` and the same values in `wrangler.jsonc`, not secrets. `ACCESS_AUD` is the Access application's AUD tag. If the application is ever recreated, update it in both files, or the gate refuses every request ([#14](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/14), [ADR 0002](docs/adr/0002-cloudflare-access-instead-of-in-app-login.md)). Shortening a session also ends existing logins older than the new duration, and lengthening it again doesn't bring them back, so redo the [pre-trip routine](docs/pre-trip-routine.md) after any session change ([#22](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/22)).

The repo is public. Itineraries and these docs are in git. The schedule, checklist, notes, and bookings live in storage, not in commits ([ADR 0003](docs/adr/0003-itineraries-are-repo-content.md)).

## Where to look

- `src/routes`: `/`, `/options`, `/options/$optionNumber`, `/schedule`, `/schedule/$date`, `/schedule/archived/$scheduleId`, `/checklist`
- `src/trip`: domain, Options 1–4, rail geometry
- `src/access`: Access gate
- `src/components`: UI, maps, tab bar, and sidebar
- [`GLOSSARY.md`](GLOSSARY.md): glossary
- [`docs/adr`](docs/adr): storage, Access, itineraries as repo content, `cf` for dev and build
- [`docs/itinerary.md`](docs/itinerary.md): source write-up
- [`docs/pre-trip-routine.md`](docs/pre-trip-routine.md): get the iPhone and desktop logged in before the Trip
- [`docs/agents/itineraries.md`](docs/agents/itineraries.md): add or revise an itinerary
