# Japan, December 2026

Private web app for Phillip's fourth trip to Japan, December 6–20, 2026 (14 nights).

## Status

Four phases, in order. Spec: [issue #1](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/1).

**Phase 1, compare.** Live at https://japan-trip-december-2026.phillip-b52.workers.dev, behind Cloudflare Access. Home counts whole days until midnight on December 6 in Tokyo. Options 1–4 show their stays, all 15 days, and the anchors: arrival, the Shigeharu visit on the morning of December 11, the birthday on December 15, and departure. `/options` compares them on the same rows and on one map. Each itinerary page has its own map. Train moves follow the real rail lines when the route is known. A move with no route is a straight line between the places it joins. `/options` and every itinerary page are prerendered; Home stays dynamic.

**Phase 2, schedule.** Live. Choosing copies an itinerary into a schedule that later revisions leave alone. The schedule has a page for each day, stay notes, day notes, a trip note, and a checklist. During the trip, Home shows today's page. It's stored in a SQLite Durable Object near Japan ([ADR 0001](docs/adr/0001-durable-object-sqlite-for-schedule-data.md)). Devices catch up when the app opens, regains focus, or reconnects. Before the Trip, follow the [pre-trip routine](docs/pre-trip-routine.md).

**Phase 3, bookings.** Not built. Activities, hotel details, stay edits, pins from map links, and a full-screen map.

**Phase 4, offline.** In progress. The app installs to the iPhone Home Screen with its own name and icon. Pages link `public/manifest.webmanifest` with credentials, so the request carries the Access session. Reading the schedule, Today, checklist, notes, and a Japan map with no connection is not built yet.

## Stack

- [TanStack Start](https://tanstack.com/start) and React 19. Routes in `src/routes`.
- [Tailwind CSS](https://tailwindcss.com/) 4, dark only.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/). `cf dev`, `cf build`, and `cf deploy --prebuilt` read `cloudflare.config.ts`. Wrangler stays for live logs, single secrets, and types ([ADR 0005](docs/adr/0005-use-cf-cli-for-dev-and-build.md)). Entry is `src/server.ts`.
- [MapLibre GL](https://maplibre.org/) with [Protomaps](https://protomaps.com/)' dark style. The Worker serves the Detail tiles from R2 behind Access, and the app hosts the glyphs, sprites and MapLibre worker itself.
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

### Map tiles

The map's street detail, the Detail tiles, comes from one PMTiles archive in the Worker's R2 bucket (`DETAIL_TILES`, object `detail.pmtiles`). The Worker serves it tile by tile at `/tiles/detail/{z}/{x}/{y}.mvt`, after the Access gate. Glyphs and sprites are static files in `public/map`.

```bash
vp run build-map-tiles    # extracts into the git-ignored tiles/ (needs Go)
vp run seed-local-tiles   # puts tiles/detail-local.pmtiles in the local bucket
vp run build-map-assets   # refreshes public/map
```

`build-map-tiles` reads the latest Protomaps daily build, or the build date you pass. It writes three extracts and prints their sizes:

- `overview.pmtiles`: Japan, zoom 0–8.
- `detail.pmtiles`: zoom 0–14, a 24 km box around every place in `src/trip/catalogue/places.ts`.
- `detail-local.pmtiles`: a 4 km box around Tokyo Station.

Run it again after adding a place. Locally, the map shows street detail only around Tokyo Station.

```bash
vp check           # format, lint, and typecheck
vp run typecheck   # patched tsc, including Effect diagnostics
vp test            # tests under src/
```

`vp run build-app-manifest` writes the web manifest and its icons to `public/` and the Apple touch icon to `src/icons/`. It reads the name and colours from `src/lib/app-identity.ts` and draws 日本 from the display font. It needs `uv`. Run it after changing either, and commit the result. Every page inlines the touch icon, because Safari fetches link icons without cookies and Access would answer a URL with its login page.

`vp run build` runs `cf build`. It builds the Worker and prerenders `/options` and every Itinerary page in the catalogue (`scripts/prerender.ts`), fetching them through the preview's Access simulation. The build fails if a listed page's HTML is missing, if any HTML contains an email address, or if a page links to an Itinerary page that isn’t prerendered. `vp preview` serves that build with the same Access simulation.

## Deploy

`vp run deploy` runs `cf build`, then `cf deploy --prebuilt --mode production`, to https://japan-trip-december-2026.phillip-b52.workers.dev, the app's stable address. The Worker name is `japan-trip-december-2026`. That publishes the Build Output in `.cloudflare/output/v0`, including the prerendered pages and the TripStore SQLite export. You need `cf auth login`. Before the first `cf` deploy, run `vp exec wrangler secret put ACCESS_DEV_SIMULATION` and enter `false`. A dry run of the deploy command uploads nothing and does not check secrets. Live logs are `vp exec wrangler tail`. A single secret is `vp exec wrangler secret put`. Types are `vp run cf-typegen`.

The map needs the Detail tiles archive in the production R2 bucket. Before the first deploy, create the bucket with `vp exec cf r2 buckets create --name japan-trip-detail-tiles --location-hint apac`, then run `vp run build-map-tiles` and `vp run upload-tiles`. Upload again whenever you rebuild the extracts. Until the archive is in the bucket, every map shows its "can't load" placeholder ([#37](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/37)).

Sign-in is Cloudflare Access, an email one-time PIN for one address. `src/server.ts` checks the assertion. Access is Worker-level: the team is `phillip-hirsch.cloudflareaccess.com`, the policy allows only phillip@350home.com, and the application and global sessions last one month. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ACCESS_ALLOWED_EMAIL` are text bindings in `cloudflare.config.ts` and the same values in `wrangler.jsonc`, not secrets. `ACCESS_AUD` is the Access application's AUD tag. If the application is ever recreated, update it in both files, or the gate refuses every request ([#14](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/14), [ADR 0002](docs/adr/0002-cloudflare-access-instead-of-in-app-login.md)). Shortening a session also ends existing logins older than the new duration, and lengthening it again doesn't bring them back, so redo the [pre-trip routine](docs/pre-trip-routine.md) after any session change ([#22](https://github.com/phillip-hirsch/japan-trip-december-2026/issues/22)).

The repo is public. Itineraries and these docs are in git. The schedule, checklist, notes, and bookings live in storage, not in commits ([ADR 0003](docs/adr/0003-itineraries-are-repo-content.md)).

## Where to look

- `src/routes`: `/`, `/options`, `/options/$optionNumber`, `/schedule`, `/schedule/$date`, `/checklist`
- `src/trip`: one folder per service, plus what they share
  - `domain`: types, calendar, limits and Schedule rules shared by browser and server
  - `catalogue`: places, stations, rail lines and rail geometry
  - `itineraries`: the Itineraries service and Options 1–4
  - `trip`: the Trip service, its runtime, server functions and tests
  - `trip-store`: the Trip store Durable Object and Trip writes
  - `schedule-store`: SQL queries and migrations
  - `detail-tiles`, `location-links`: the Detail tiles archive and the location link resolver
  - `client`: React Query, Drafts and route params
- `src/access`: Access gate
- `src/components`: UI, maps, tab bar, and sidebar
- [`GLOSSARY.md`](GLOSSARY.md): glossary
- [`docs/adr`](docs/adr): storage, Access, itineraries as repo content, `cf` for dev and build
- [`docs/itinerary.md`](docs/itinerary.md): source write-up
- [`docs/pre-trip-routine.md`](docs/pre-trip-routine.md): get the iPhone and desktop logged in before the Trip
- [`docs/agents/itineraries.md`](docs/agents/itineraries.md): add or revise an itinerary
