Use Macroscope's default approvability criteria.

Additionally, any pull request that changes product defaults is not auto-approvable and requires human review.

Any pull request that adds or broadens a directive that disables or suppresses a lint,
type-checker, LSP, or other static-analysis diagnostic is not auto-approvable and requires
human review. This includes file-level, line-level, and configuration-level overrides, and
any severity change in `tsconfig.effect.json`.

Any pull request that changes one of the following is not auto-approvable and requires
human review, because a mistake there can lose Trip data, lock Phillip out of the app, or
leave the installed app stuck on a broken build:

- The Cloudflare Access gate (`src/access/`) or how requests reach it.
- Schedule store migrations (`src/trip/schedule-store/migrations.ts`).
- Cloudflare bindings or deploy settings (`wrangler.jsonc`, `cloudflare.config.ts`).
- The service worker or its precache (`src/offline/`, `scripts/service-worker.ts`).
