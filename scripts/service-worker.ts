import { rm } from 'node:fs/promises'
import path from 'node:path'

import { injectManifest } from '@serwist/build'
import { build } from 'vite-plus'
import type { Plugin } from 'vite-plus'

import { checkSpaShell } from './check-spa-shell.ts'

/** Where the SPA shell is served, as `_shell.html` in the client output. */
export const shellPath = '/_shell'

/**
 * The SPA shell: `/` rendered with the shell header, so only the root route
 * renders and no loader runs. Listed by hand instead of Start's `spa` option,
 * which would also make `cf dev` render every page as the shell.
 */
export const shellPage = {
  path: '/',
  prerender: {
    enabled: true,
    outputPath: shellPath,
    headers: { 'X-TSS_SHELL': 'true' },
    crawlLinks: false,
  },
  sitemap: { exclude: true },
}

const workerSource = path.resolve(
  import.meta.dirname,
  '../src/offline/service-worker.ts',
)

/**
 * Builds the service worker after Start's prerender, so the shell and the
 * prerendered pages exist (ADR 0006). It fails the build if the shell carries
 * loader data, bundles the worker on the Serwist runtime, then injects the
 * precache list: the hashed assets, the icons, the web manifest and every
 * prerendered page, the shell included. List it after `tanstackStart()`.
 */
export const serviceWorker = (): Plugin => ({
  name: 'japan-trip:service-worker',
  apply: 'build',
  enforce: 'post',
  buildApp: {
    order: 'post',
    async handler(builder) {
      const outDir = path.resolve(
        builder.config.root,
        builder.environments.client.config.build.outDir,
      )

      await checkSpaShell(path.join(outDir, `${shellPath}.html`))

      const bundleDir = path.join(builder.config.root, '.service-worker')

      await build({
        configFile: false,
        logLevel: 'warn',
        // Serwist reads it, and a worker has no `process`.
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        build: {
          outDir: bundleDir,
          emptyOutDir: true,
          minify: true,
          lib: {
            entry: workerSource,
            formats: ['iife'],
            name: 'serviceWorker',
            fileName: () => 'sw.js',
          },
        },
      })

      const { count, size, warnings } = await injectManifest({
        swSrc: path.join(bundleDir, 'sw.js'),
        swDest: path.join(outDir, 'sw.js'),
        globDirectory: outDir,
        globPatterns: [
          'assets/**/*.{js,css,woff2}',
          '*.png',
          'manifest.webmanifest',
          '**/*.html',
        ],
        // Hashed file names already change with their content.
        dontCacheBustURLsMatching: /^assets\//,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      })

      await rm(bundleDir, { recursive: true, force: true })

      for (const warning of warnings) builder.config.logger.warn(warning)

      if (warnings.length > 0) {
        throw new Error('The service worker precache list has warnings')
      }

      builder.config.logger.info(
        `Service worker precaches ${count} files, ${Math.round(size / 1024)} KiB`,
      )
    },
  },
})
