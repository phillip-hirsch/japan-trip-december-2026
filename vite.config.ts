import path from 'node:path'

import { recommended as effectRecommended } from '@effect/tsgo/oxlint-presets'
import { devtools } from '@tanstack/devtools-vite'
import { defineConfig, lazyPlugins } from 'vite-plus'
import type { Plugin } from 'vite-plus'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { voidPlugin } from 'void'

import {
  checkPrerenderedHtml,
  readPrerenderedPaths,
} from './scripts/prerender.ts'

import effectTsconfig from './tsconfig.effect.json' with { type: 'json' }

// tsconfig.effect.json is the single Effect diagnostics policy. The patched tsc
// reads it directly; Oxlint gets the same severities as effecttsgo/* rules
// (floatingEffect -> effecttsgo/floating-effect, cryptoRandomUUID ->
// effecttsgo/crypto-random-uuid). Warnings and suggestions never fail a gate.
const toKebabCase = (name: string) =>
  name.replace(
    /[A-Z]+(?![a-z])|[A-Z]/g,
    (word, index: number) => (index ? '-' : '') + word.toLowerCase(),
  )

const effectLintRules = Object.fromEntries(
  Object.entries(
    effectTsconfig.compilerOptions.plugins[0].diagnosticSeverity,
  ).map(([diagnostic, severity]) => [
    `effecttsgo/${toKebabCase(diagnostic)}`,
    severity === 'error' || severity === 'off' ? severity : 'warn',
  ]),
)

const agentToolingIgnores = [
  '.agent/**',
  '.agents/**',
  '.claude/**',
  '.codex/**',
  '.continue/**',
  '.cursor/**',
  '.gemini/**',
  '.opencode/**',
  '.pi/**',
  '.roo/**',
  '.windsurf/**',
  'tools/oxlint/anti-slop/**',
]

const voidWrapperImport =
  'import original from "@tanstack/react-start/server-entry";'

// Void's TanStack Start wrapper imports the stock server entry and re-exports
// only its default. Without this the Worker skips src/server.ts, so it loses
// the Access gate and the TripStore export.
const keepServerEntry = (): Plugin => ({
  name: 'spike:void-keep-server-entry',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/.void/tanstack-start-trigger-wrapper.ts')) return

    if (!code.includes(voidWrapperImport)) {
      throw new Error(`Void wrapper no longer contains: ${voidWrapperImport}`)
    }

    const serverEntry = JSON.stringify(path.resolve('src/server.ts'))

    return code.replace(
      voidWrapperImport,
      `import original from ${serverEntry};\nexport * from ${serverEntry};`,
    )
  },
})

const config = defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: [
      ...agentToolingIgnores,
      '.vite-hooks/**',
      'pnpm-lock.yaml',
      'src/routeTree.gen.ts',
      'src/trip/rail-geometry.json',
      'worker-configuration.d.ts',
    ],
  },
  lint: {
    extends: [effectRecommended],
    jsPlugins: [
      { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
      { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
      {
        name: 'anti-slop-effect',
        specifier: './tools/oxlint/anti-slop/effect/index.ts',
      },
    ],
    ignorePatterns: [...agentToolingIgnores, 'worker-configuration.d.ts'],
    rules: {
      ...effectLintRules,
      'vite-plus/prefer-vite-plus-imports': 'error',
      'oxc/no-accumulating-spread': 'error',
      'anti-slop/no-array-filter-map': 'error',
      'anti-slop/no-reduce-accumulator-copy': 'error',
      'anti-slop/no-chained-type-assertions': 'error',
      'anti-slop/no-conditional-empty-object-spread': 'error',
      'anti-slop/no-known-value-widening': 'error',
      'anti-slop/no-module-mocking': 'error',
      'anti-slop/no-object-parameters': 'error',
      'anti-slop/no-reflect-apply': 'error',
      'anti-slop/no-reflect-get': 'error',
      'anti-slop/no-runtime-typeof': 'error',
      'anti-slop/no-shape-in-symbol-names': 'error',
      'anti-slop/no-unknown-parameters': 'error',
      'anti-slop/no-unknown-returns': 'error',
      'anti-slop/no-unknown-type-aliases': 'error',
      'anti-slop/no-unsafe-dictionary-type': 'error',
      'anti-slop/no-widen-then-assert': 'error',
      'anti-slop/require-readable-spacing': 'error',
      'anti-slop/require-safety-comment-for-type-assertion': 'error',
      'anti-slop-effect/no-manual-effect-error-tag': 'error',
      'anti-slop-effect/no-manual-tag-comparison': 'error',
      'anti-slop-effect/no-manual-tagged-construction': 'error',
      'anti-slop-effect/no-service-constructor-imports': 'error',
      'anti-slop-effect/prefer-effect-match': 'error',
    },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  // MapLibre's docs ask TanStack Start apps to bundle it, avoiding CJS
  // resolution issues. The map itself never renders on the server.
  ssr: { noExternal: ['maplibre-gl'] },
  test: { include: ['src/**/*.test.ts'] },
  // Tests run the Effect services in Node; the Worker and UI plugins are only
  // for dev and build (the Cloudflare plugin cannot start under Vitest).
  plugins: lazyPlugins(async () => {
    if (process.env.VITEST) return []
    const prerenderedPaths = await readPrerenderedPaths()

    return [
      devtools(),
      keepServerEntry(),
      voidPlugin(),
      tailwindcss(),
      // Prerenders through the local preview, whose Access dev simulation
      // passes the gate as it does for `vp dev`.
      tanstackStart({
        pages: prerenderedPaths.map((path) => ({ path })),
        prerender: {
          enabled: true,
          crawlLinks: false,
          autoStaticPathsDiscovery: false,
          autoSubfolderIndex: false,
        },
      }),
      viteReact({ compiler: true }),
      checkPrerenderedHtml(prerenderedPaths),
    ]
  }),
})

export default config
