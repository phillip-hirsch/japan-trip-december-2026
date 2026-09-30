import { recommended as effectRecommended } from '@effect/tsgo/oxlint-presets'
import { devtools } from '@tanstack/devtools-vite'
import { defineConfig, lazyPlugins } from 'vite-plus'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'

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
    ],
  },
  lint: {
    extends: [effectRecommended],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact({ compiler: true }),
  ]),
})

export default config
