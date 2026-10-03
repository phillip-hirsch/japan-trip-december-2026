# Vendored anti-slop

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `e6676e8d0bf17c678cb45b9dacb2bd6ca8dea53a`, path `skills/install-anti-slop/assets/anti-slop/`.

Copied from the repo-local `install-anti-slop` skill (`.claude/skills/install-anti-slop/`, added in `544e90d`) with its `scripts/install.mjs`. Every file was checked against the upstream commit's blobs. All 38 files are present, and the only differences are the deviations listed below.

## Installed plugins

- `tools/oxlint/anti-slop/index.ts`: generic rules, registered as `anti-slop`.
- `tools/oxlint/anti-slop/effect/index.ts`: Effect rules, registered as `anti-slop-effect` because `effect` is a direct dependency.

Both are registered in `vite.config.ts` (`lint.jsPlugins`) with every rule at `error`, alongside native `oxc/no-accumulating-spread`.

## Intentional deviations

- Upstream imports `@oxlint/plugins`. Here every import uses `vite-plus/lint/plugins` instead, to satisfy `vite-plus/prefer-vite-plus-imports`. That module re-exports `@oxlint/plugins` from Vite+, so there is no direct `@oxlint/plugins` dependency. The rewrite was already present in the skill's copy at `544e90d`.
- `vendor/eslint-stylistic/` keeps its own `LICENSE` and `UPSTREAM.md`.
