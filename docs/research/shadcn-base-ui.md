# Setting up shadcn/ui (Base UI) in the TanStack Start + Tailwind v4 + Vite+ project, preset choice for a dark-only "winter night in Japan" aesthetic, dark-only theming, and Japanese serif display-font delivery

# Fact sheet (verified 2026-09-29 unless marked)

Legend: **[V]** = verified by me against a primary source or reproduced in a temp clone; **[U]** = taken from a report, not independently verified.

## Versions

- shadcn CLI `latest` = **4.21.0** (dist-tags: latest 4.21.0, canary 4.2.0-canary.0, rc 4.10.0-rc.674ae44). **[V]** `pnpm view shadcn dist-tags`
- `@base-ui/react` = **1.8.0**, published 2026-09-04T08:52Z. **[V]** `pnpm view @base-ui/react version time`
- `cn` = 0.4.0 (replaces clsx + tailwind-merge; `src/lib/utils.ts` becomes `export { cn } from "cn"`). **[V]** `pnpm view cn version`; generated file in temp clone
- `@fontsource/shippori-mincho`, `@fontsource/noto-serif-jp`, `@fontsource-variable/noto-serif-jp` = **5.3.0** (2026-07-19), license OFL-1.1. **[V]** `pnpm view`, https://cdn.jsdelivr.net/npm/@fontsource/shippori-mincho@5.3.0/package.json
- Installed Tailwind in the repo = **4.3.3**; Vite core is `@voidzero-dev/vite-plus-core@1.0.0` aliased as `vite`. **[V]** node_modules/tailwindcss/package.json, node_modules/vite/package.json
- Component peer deps: react-day-picker latest 10.0.1, recharts latest 3.10.1 (registry pins `recharts@3.8.0`), cmdk 1.1.1 depends on four `@radix-ui/*` packages, sonner 2.0.8, next-themes 0.4.6. **[V]** `pnpm view ...`; https://ui.shadcn.com/r/styles/base-sera/registry.json

## 1. Init command and project detection

- Preset flag takes the short name: `--preset vega`; `--preset base-nova` errors with `Invalid preset: base-nova. Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea`. **[V]** `pnpm dlx shadcn@4.21.0 init -b base --preset base-nova`
- `init --help`: `-t` templates next|start|vite|react-router|laravel|astro; `-b` base|radix|aria; `-d` = `--template=next --preset=base-nova`; `--no-monorepo`, `--rtl`, `--pointer`, `--reinstall` flags exist. **[V]** `pnpm dlx shadcn@4.21.0 init --help`
- Detection is unaffected by `defineConfig` coming from `vite-plus`: `shadcn info --json` in a clone reports framework "TanStack Start", tailwindVersion "v4", tailwindCss "src/styles.css", importAlias "#", config null. Detection keys on `@tanstack/react-start` in package.json, not on vite.config. **[V]** `pnpm dlx shadcn@4.21.0 info --json`
- **Repo as-is, `init` is NOT non-interactive**: with `"#/*"` first in tsconfig `paths` and `imports: {"#/*": "./src/*"}` in package.json, `init -t start -b base --preset vega --no-monorepo -y` passed preflight then stopped at the legacy prompt "Would you like to use TypeScript (recommended)?" **[V]** reproduced in clone `asis` (stdin closed)
- **Fix A (reorder tsconfig) works**: moving `"@/*"` above `"#/*"` in tsconfig `paths` (package.json `imports` untouched) made the same command run to completion: wrote `components.json` (style `base-vega`, rsc false, baseColor neutral, iconLibrary lucide, css `src/styles.css`, tailwind.config `""`, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`, plus `rtl`, `menuColor`, `menuAccent`, `registries`), `src/lib/utils.ts`, `src/components/ui/button.tsx` (from `-t start`), updated `src/styles.css`, `package.json`, `pnpm-lock.yaml`. No changes to vite.config.ts, wrangler.jsonc or routes. **[V]** clone `reorder`, `git status`
- **Fix B (hand-written components.json with `#/` aliases + `shadcn apply <preset> -y`) works** and keeps the `#/` alias; `shadcn add` then rewrites imports to `#/components/ui/x.tsx` (with extension; OK because `allowImportingTsExtensions: true`). **[U]** Report B temp-clone runs; alias rewriting not re-run by me
- Dependencies added by the vega preset (all into `dependencies`): `@base-ui/react ^1.8.0`, `@fontsource-variable/inter ^5.3.0`, `class-variance-authority ^0.7.1`, `cn ^0.4.0`, `lucide-react ^1.48.0`, `shadcn ^4.21.0`, `tw-animate-css ^1.4.0`. **[V]** `git diff package.json` in clone
- `src/styles.css` after init: adds `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@import "@fontsource-variable/inter"`, `@custom-variant dark (&:is(.dark *))`, an `@theme inline` block mapping `--color-*` and `--radius-*` (and `--font-heading: var(--font-sans)`, `--font-sans: 'Inter Variable', sans-serif`), a `:root` light palette, a `.dark` palette, and `@layer base` (border-border, bg-background, font-sans). Existing rules are preserved. **[V]** clone `reorder` `src/styles.css`
- `shadcn eject` inlines `shadcn/tailwind.css` and removes the `shadcn` dependency. **[V]** `shadcn eject --help`; **[U]** lockfile reduction (~2,095 lines) from Report B
- `shadcn apply --only theme,font` limits a re-apply to tokens/fonts. **[V]** `shadcn apply --help`
- `vp dlx` exists ("Download and execute a package without installing it globally"); I only tested `pnpm dlx`. **[V]** `vp dlx --help`
- Side finding: committed `pnpm-lock.yaml` is out of sync with package.json; `pnpm install --frozen-lockfile` fails (ERR_PNPM_OUTDATED_LOCKFILE). Run `vp install` first. **[V]** reproduced in clone
- Gates: after `add sidebar drawer sheet tabs toggle-group card item empty badge field input-group kbd spinner toast marker scroll-area checkbox` and `vp check --fix` (reformats to single quotes / no semicolons), `vp check` and `vp run typecheck` **fail on exactly one error**: `src/components/ui/scroll-area.tsx(1,13): TS6133 'React' is declared but its value is never read` (repo has `noUnusedLocals`). The unused `import * as React` is in the upstream registry source. Delete that line after adding. All other 31 files pass. **[V]** clone `reorder`; https://ui.shadcn.com/r/styles/base-vega/scroll-area.json
- The CLI inserts `@custom-variant dark` only when none exists; a customised `@custom-variant dark (&:where(.dark, .dark *))` survived a subsequent `shadcn add avatar`. **[V]** clone `reorder`

## 2. Base UI presets (CLI name -> components.json style)

All 8 verified via CLI error list; geometry verified from registry class strings for vega and sera, others from Report B/A. **[V]** names; **[V]** vega/sera specifics; **[U]** other styles' specifics

- **vega** -> `base-vega`: Inter / Lucide; button `rounded-md text-sm font-medium`, sizes h-6 xs, h-8 sm, **h-9 default**, h-10 lg; input `h-9 rounded-md border shadow-xs`; card `rounded-xl shadow-xs ring-1 ring-foreground/10 [--card-spacing:--spacing(6)]` (24 px). https://ui.shadcn.com/r/styles/base-vega/{button,card,input}.json
- **sera** -> `base-sera`: Noto Sans + Playfair Display / Lucide on taupe; button `rounded-none text-xs font-semibold tracking-widest uppercase`, sizes h-7 xs, h-9 sm, **h-10 default**, h-11 lg; input `h-10 border-transparent border-b-input bg-transparent px-0` (underline only); card `shadow-sm ring-1 ring-foreground/5 [--card-spacing:--spacing(8)]` (32 px; `size=sm` -> 20 px); CardTitle `cn-font-heading text-lg font-semibold tracking-wider uppercase`. https://ui.shadcn.com/r/styles/base-sera/{button,card,input}.json
- **nova** -> `base-nova` (default): Geist / Lucide, rounded-lg, h-8, 16 px cards. **[U]**
- **maia** -> `base-maia`: Figtree / Hugeicons, pill (rounded-4xl) controls, rounded-2xl cards, h-9. **[U]**
- **lyra** -> `base-lyra`: JetBrains Mono / Phosphor, rounded-none, text-xs, h-8. **[U]**
- **mira** -> `base-mira`: Inter / Hugeicons, h-7, text-xs, compact. **[U]**
- **luma** -> `base-luma`: Inter / Lucide, rounded-4xl, shadow-md, filled inputs, h-9. **[U]**
- **rhea** -> `base-rhea`: Inter / Lucide, "compact Luma", rounded-2xl, h-8. **[U]**
- Preset codes encode style, baseColor (neutral, stone, zinc, gray, mauve, olive, mist, taupe), theme, chartColor, iconLibrary (lucide, hugeicons, tabler, phosphor, remixicon), font/fontHeading (Latin only, 52 `registry:font` items, no CJK), radius, menuAccent, menuColor. `preset decode b7D4AApZg` = sera / mist / red / mist charts / lucide / noto-sans / heading inherit / radius default. **[V]** `pnpm dlx shadcn@4.21.0 preset decode b7D4AApZg`; registry font-item count
- Base colour **mist** dark tokens: background `oklch(0.148 0.004 228.8)` (near-black, slight blue tint), card `oklch(0.218 0.008 223.9)`, secondary `oklch(0.275 0.011 216.9)`. **[V]** https://ui.shadcn.com/r/colors/mist.json
- No preset ships a Japanese serif or the requested palette; colours must be hand-set. **[V]**

## 3. Base UI registry components (63 `registry:ui`, identical across base-* styles)

accordion, alert, alert-dialog, aspect-ratio, attachment, avatar, badge, breadcrumb, bubble, button, button-group, calendar, card, carousel, chart, checkbox, collapsible, combobox, command, context-menu, dialog, direction, drawer, dropdown-menu, empty, field, form, hover-card, input, input-group, input-otp, item, kbd, label, marker, menubar, message, message-scroller, native-select, navigation-menu, pagination, popover, progress, questionnaire, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip. **[V]** https://ui.shadcn.com/r/styles/base-sera/registry.json

- Mobile-relevant details **[V]** (same registry.json + generated sources):
  - `sidebar`: deps `cn`; registryDeps button, input, separator, sheet, skeleton, tooltip, use-mobile. Renders a `Sheet` when `isMobile`; desktop DOM is `hidden md:block`. `useIsMobile()` starts `undefined` -> `false` on the server, so SSR always emits the desktop markup (hidden on phones by CSS) and the mobile Sheet becomes available after hydration. Needs `TooltipProvider`.
  - `drawer`: native `@base-ui/react/drawer` (no vaul). `sheet`: Base UI Dialog. `toast`: `@base-ui/react/toast` + button. `tabs`, `toggle-group`, `scroll-area`, `checkbox`, `combobox`: Base UI primitives (exports confirmed in @base-ui/react 1.8.0).
  - `card`, `item`, `empty`, `badge`, `field`, `input-group`, `kbd`, `spinner`, `marker`, `native-select`: depend only on `cn`.
  - Heavier: `calendar` (react-day-picker@latest + date-fns), `chart` (recharts@3.8.0), `carousel` (embla-carousel-react), `command` (cmdk 1.1.1 -> transitive Radix), `input-otp`, `resizable`.
  - `sonner`: deps `sonner`, `next-themes`; it is in `COMPONENTS_HIDDEN_FROM_SELECTION` for base, and https://ui.shadcn.com/docs/components/base/sonner 308-redirects to /toast. `toast` is listed in `DEPRECATED_COMPONENTS` for non-base bases only (availableIn: ["base"]). **[V]** https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/constants.ts
- **No timeline component.** Closest: `marker` (labelled separators / status rows for date breaks) + `item` + `separator`. **[V]** registry list; **[U]** marker variant names default/separator/border (Report B)
- No `registry:ui` or `registry:block` item in the base registry declares `cssVars`, so `shadcn add` will not write new `:root`/`.dark` tokens for first-party components; only `shadcn apply` (full preset) rewrites tokens. **[V]** parsed base-sera registry.json

## 4. Dark-only with Tailwind v4

- Generated components rely on the `dark:` variant: 10 of 22 generated files contain `dark:` utilities (button 4, tabs 3, input-group 3, badge 3, field, kbd, input, toggle, checkbox, textarea 1 each). The variant must stay defined. **[V]** grep in clone
- Tailwind 4.3.3 compiles `@custom-variant dark (&:is(.dark *))`, `(&)` and `(&:where(*))`; `scheme-dark` / `scheme-only-dark` utilities exist. **[V]** compiled with @tailwindcss/node 4.3.3
- Tailwind docs' manual dark-mode snippet is `@custom-variant dark (&:where(.dark, .dark *));`; `color-scheme: dark` fixes native scrollbars/inputs/autofill. **[U]** https://tailwindcss.com/docs/dark-mode (not re-fetched)
- Base UI requires two global styles the shadcn apply does not add: an app-root wrapper with `isolation: isolate` (portals stack above everything) and `body { position: relative }` (iOS 26+ Safari backdrops). **[V]** https://base-ui.com/react/overview/quick-start.md
- `RootDocument` in `src/routes/__root.tsx` renders `<html lang="en">` server-side, so `className="dark"` there needs no script and cannot flash. **[V]** file read
- Contrast numbers (foreground `oklch(0.93 0.02 85)` 15.6:1 on `oklch(0.17 0.014 255)`; vermilion `oklch(0.64 0.19 33)` 5.2:1 on background but paper-white on vermilion only 2.98:1, so `--primary-foreground` must be the ink colour). **[U]** Report B's local WCAG computation, plausible but not re-run

## 5. Japanese serif display font

- `@fontsource/shippori-mincho@5.3.0/700.css` = **122 `@font-face` rules, 110,234 bytes** of CSS before any glyph loads. **[V]** jsdelivr fetch
- The 9 unique kanji in 東京 京都 金沢 箱根 福岡 span 8 Fontsource unicode-range slices, ~99 KB total for one weight (A: 98,928 B; B: ~99 KB, concordant). **[U]** both reports; not re-summed
- Google Fonts `text=` with Chrome UA, 9 kanji + A–Z a–z 0–9 punctuation: Shippori Mincho 700 = **15,292 B**, Noto Serif JP 700 = **11,468 B**; one `@font-face`; kit `Cache-Control: public, max-age=86400` (1 day) on fonts.gstatic.com. Two third-party origins. **[V]** curl 2026-09-29
- Self-hosted pyftsubset (fonttools 4.66.1, OFL TTFs from google/fonts): Shippori Mincho Bold 9 kanji only = **2,848 B**; ASCII 0x20–0x7E + 20 kanji = **21,700 B**; Noto Serif JP variable (wght 200–900) ASCII + 20 kanji = **28,520 B**. Source TTFs are 8.6 MB / 13.6 MB. **[V]** `uvx --from 'fonttools[woff]' pyftsubset ...`
- Broad coverage is not viable: kana + JIS level-1 kanji ≈ 657 KB (Shippori Bold) / 1.21 MB (Noto Serif JP). **[U]** Report B
- Vite+ core 1.0.0 `build.assetsInlineLimit` default **4096** bytes, `assetsDir` default `assets` -> a kanji-only subset under 4 KB gets base64-inlined into the CSS; a ~22 KB file becomes a hashed `/assets/*` file. **[V]** node_modules/vite/dist/vite/node/index.d.ts
- Cloudflare Workers static assets default `Cache-Control: public, max-age=0, must-revalidate` + ETag; override via `public/_headers` (`/assets/*` -> `public, max-age=31536000, immutable`); `_headers` is **not** applied to Worker-generated (SSR) responses. **[V]** https://developers.cloudflare.com/workers/static-assets/headers/
- Component titles use `font-heading` (`cn-font-heading` in source; `--font-heading` in `@theme inline`), so setting `--font-heading` to the Japanese serif stack restyles CardTitle/DrawerTitle/SheetTitle/EmptyTitle. **[V]** sera card.json + generated styles.css; **[U]** full list of title components (Report B)

## Repo state note

`src/routeTree.gen.ts` showed as modified in `git status` before I started; I made no changes to `/Users/phillip/Developer/japan-trip-december-2026`. All experiments ran in clones under `/var/folders/f1/nvhgj4r110960rknvqsfksmc0000gn/T/tmp.PRSmjmgulE/{app,asis,reorder,noimports}`.

## Disagreements between researchers

- Init path. A predicted (from source, untested) that `init` would auto-configure once `@/*` precedes `#/*` in tsconfig paths; B tested the repo as-is, saw it fall into legacy prompts, and recommended skipping `init` for a hand-written components.json + `shadcn apply`. I reproduced both: as-is, `init` stops at 'Would you like to use TypeScript?'; with `@/*` reordered first (package.json `imports` untouched), `init -t start -b base --preset vega --no-monorepo -y` completes non-interactively and writes the expected files. Both paths are valid; the real choice is which import alias (`@/` vs `#/`) the project standardises on.
- Preset. A recommends vega (restrained, lets typography/accent carry the look); B recommends sera (print/editorial, 40 px controls). Facts on both are verified. This is a taste call, but sera has concrete costs for this app: button labels are `text-xs uppercase tracking-widest` (uppercase is meaningless for kanji and `tracking-widest` letter-spaces Japanese labels), inputs are underline-only (weak affordance on a phone), cards default to 32 px padding, and CardTitle adds `tracking-wider uppercase`. Vega's `size="lg"` gives h-10 where needed. I side with A: vega (optionally radius small) plus hand-set tokens and `--font-heading`, with sera as the alternative only if an editorial look everywhere is wanted.
- Dark-only token placement. A: put dark values in `:root`, delete `.dark`, keep the `dark` custom variant. B: keep `.dark` because a later `shadcn add` could write light values into `:root`. I checked the registry: no first-party `registry:ui`/`registry:block` item declares `cssVars`, so `add` never touches tokens; only a full `shadcn apply` does (use `--only`). Both are safe; A's single-block `:root` + `color-scheme: dark` is simpler and recommended. Both agree `html.dark` and `@custom-variant dark` must remain because 10 generated files use `dark:` utilities (verified).
- Sonner. A said sonner is hidden for Base and its docs redirect to Toast; B listed sonner as available with `next-themes`. Both are true: it is in the registry (deps sonner + next-themes) but in `COMPONENTS_HIDDEN_FROM_SELECTION` for base, and /docs/components/base/sonner 308-redirects to /toast. Recommendation (both agree): use `toast`.
- Verification depth. A could not run the CLI (sandbox); B ran it. Every A claim that mattered (detection, preset names, alias reorder fix, expected diff, hidden sonner) checked out when I ran it, so A's source-reading was accurate; B's measurements (font sizes, mist tokens, sera/vega geometry, lockfile drift) also reproduced within a few hundred bytes.
- Gap both missed: `scroll-area.tsx` fails `vp check` and `vp run typecheck` (TS6133 unused `import * as React`) under this repo's `noUnusedLocals`; the import is in the upstream registry source. B's tested component list did not include scroll-area.

## Recommendation

Run `vp install` first (the committed lockfile is out of sync). Then standardise on the `@/` alias by moving `"@/*"` above `"#/*"` in tsconfig `paths` (optionally drop the `#/*` entries and the package.json `imports` field later), and run `pnpm dlx shadcn@4.21.0 init -t start -b base --preset vega --no-monorepo -y` — verified to complete non-interactively and to write only components.json, src/lib/utils.ts, src/components/ui/button.tsx, src/styles.css, package.json and the lockfile. If you would rather keep `#/`, the alternative is a hand-written components.json with `#/` aliases plus `pnpm dlx shadcn@4.21.0 apply vega -y` (Report B's tested path). Add components with `pnpm dlx shadcn@4.21.0 add sidebar drawer sheet tabs toggle-group card item empty badge field input-group kbd spinner toast marker scroll-area checkbox -y`, delete the unused `import * as React from 'react'` line in scroll-area.tsx, run `vp check --fix`, then `vp check` and `vp run typecheck`. Use `toast`, not `sonner`; add `calendar`, `chart`, `carousel`, `command` only when needed (heavy deps; cmdk brings Radix transitively). Build the itinerary timeline from `item` + `marker` + `separator`.

Preset: vega (radius small). Hand-set the palette in `:root` (drop the light palette and the `.dark` block; first-party components carry no cssVars, so `add` will not reintroduce them; never re-run a bare `shadcn apply`, use `--only theme,font` if ever). Starting tokens: background oklch(0.17 0.014 255), card oklch(0.21 0.016 255), foreground oklch(0.93 0.02 85), muted-foreground oklch(0.72 0.02 80), primary (vermilion) oklch(0.64 0.19 33) with `--primary-foreground` = the ink colour, and a destructive hue distinct from vermilion. Dark-only: `<html lang="en" className="dark">` in `__root.tsx`, keep `@custom-variant dark (&:where(.dark, .dark *))` (needed by the generated `dark:` utilities), `html { color-scheme: dark }`, `body { position: relative }` and a `<div className="isolate">` root wrapper per Base UI's guidance, plus a `theme-color` meta. No theme provider, no toggle.

Font: self-host one static weight of Shippori Mincho (600 or 700, OFL) as a pyftsubset-generated woff2 built from a single curated list of display strings plus ASCII (about 22 KB, versus about 99 KB of Fontsource slices plus 110 KB of blocking CSS, or Google Fonts' 15 KB but third-party with 1-day caching). Declare it with `@font-face` and `font-display: swap`, point `--font-heading` at it with a system mincho fallback (`'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif`), preload it via a `?url` import, wrap Japanese text in `lang="ja"`, keep dynamic Japanese text (hotel names) off the display font, and add `public/_headers` with `/assets/*` -> `public, max-age=31536000, immutable`. Remove `@fontsource-variable/inter` if you choose a system body stack.

## Decisions surfaced

- Import alias: standardise on `@/` (lets `shadcn init` and all shadcn docs work unmodified) or keep `#/` (Node-native package imports, but requires a hand-written components.json and `apply`). Mixing both is the worst option.
- Preset direction: vega (neutral geometry, aesthetic carried by tokens + Japanese serif) versus sera (editorial, square, 40 px controls, but uppercase/tracked labels and underline-only inputs that fight Japanese text on a phone).
- Scope of the display font: curated strings only (~22 KB pre-subset woff2, regenerate when strings change) or any Japanese heading text (forces Fontsource slices at ~100 KB+ or a 0.6–1.2 MB broad subset). This also decides whether user-entered Japanese ever renders in the serif.
- Body typeface: keep the preset's Inter/Noto Sans webfont (~30 KB+, extra request) or a zero-byte system stack (Hiragino Sans / Yu Gothic / system-ui) given the performance-first priority.
- Dependency purity: does 'Base UI, not Radix' also exclude transitive Radix? If yes, avoid `command` (cmdk) and use `combobox` instead.
- Offline/PWA plan for use in Japan: if a service worker is planned, self-hosted fonts and immutable `/assets/*` caching become load-bearing rather than nice-to-have, and Google Fonts `text=` is ruled out.
- Colour semantics: vermilion as `--primary` (buttons, rings, links) with ink-coloured text on it, and a deliberately different destructive hue so errors do not read as the brand accent.
- Whether to `shadcn eject` (inline shadcn/tailwind.css, drop the `shadcn` runtime dependency) for a smaller dependency surface at the cost of losing upstream CSS updates.
