# Vendored anti-slop

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `e6676e8d0bf17c678cb45b9dacb2bd6ca8dea53a`, path `skills/install-anti-slop/assets/anti-slop/`.

Copied with the upstream `install-anti-slop` skill's `scripts/install.mjs`. The skill was vendored in `544e90d` for the install and later removed; to update, add the skill again from upstream and follow its update procedure against the commit above. Every file was checked against the upstream commit's blobs. All 38 files are present, and the only differences are the deviations listed below.

## Installed plugins

- `tools/oxlint/anti-slop/index.ts`: generic rules, registered as `anti-slop`.
- `tools/oxlint/anti-slop/effect/index.ts`: Effect rules, registered as `anti-slop-effect` because `effect` is a direct dependency.

Both are registered in `vite.config.ts` (`lint.jsPlugins`) with every rule at `error`, alongside native `oxc/no-accumulating-spread`.

## Intentional deviations

- Upstream imports `@oxlint/plugins`. Here every import uses `vite-plus/lint/plugins` instead, to satisfy `vite-plus/prefer-vite-plus-imports`. That module re-exports `@oxlint/plugins` from Vite+, so there is no direct `@oxlint/plugins` dependency. The rewrite was already present in the skill's copy at `544e90d`.
- `effect/rules/no-service-constructor-imports.ts` also treats `@/` imports as project-local. Upstream checks only `./` and `../`, but runtime source here imports `src/` through the `@/` alias, so the rule would otherwise never fire.
- `vendor/eslint-stylistic/` keeps its own `LICENSE` and `UPSTREAM.md` verbatim; that file's `pnpm check` / `pnpm sync:skill-assets` steps refer to the upstream repository, not this one.
