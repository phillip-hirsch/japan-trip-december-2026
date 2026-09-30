import { recommended as effectRecommended } from '@effect/tsgo/oxlint-presets'
import { devtools } from '@tanstack/devtools-vite'
import { defineConfig, lazyPlugins } from 'vite-plus'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'

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
      '.agents/**',
      '.claude/**',
      '.vite-hooks/**',
      'pnpm-lock.yaml',
      'src/routeTree.gen.ts',
      'worker-configuration.d.ts',
    ],
  },
  lint: {
    extends: [effectRecommended],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    ignorePatterns: ['worker-configuration.d.ts'],
    rules: {
      ...effectLintRules,
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  test: { include: ['src/**/*.test.ts'] },
  // Tests run the Effect services in Node; the Worker and UI plugins are only
  // for dev and build (the Cloudflare plugin cannot start under Vitest).
  plugins: lazyPlugins(() =>
    process.env.VITEST
      ? []
      : [
          devtools(),
          cloudflare({ viteEnvironment: { name: 'ssr' } }),
          tailwindcss(),
          tanstackStart(),
          viteReact({ compiler: true }),
        ],
  ),
})

export default config
