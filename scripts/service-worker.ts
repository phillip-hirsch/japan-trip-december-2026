import { rm } from 'node:fs/promises'
import path from 'node:path'

import { injectManifest } from '@serwist/build'
import { build } from 'vite-plus'
import type { Plugin } from 'vite-plus'

import { overviewMapPath } from '../src/map/overview-map.ts'
import {
  serviceWorkerPath,
  shellHeaders,
  shellPath,
} from '../src/offline/shell.ts'
import { checkClientBundle } from './check-client-bundle.ts'
import { clientOutDir } from './prerender.ts'

/**
 * The SPA shell is `/` rendered with the shell header, so only the root route
 * renders and no loader runs. It is listed here instead of turning on Start's
 * `spa` option, which would also make `cf dev` render every page as the
 * shell.
 */
export const shellPage = {
  path: '/',
  prerender: {
    enabled: true,
    outputPath: shellPath,
    headers: shellHeaders,
    crawlLinks: false,
  },
  sitemap: { exclude: true },
}

const workerSource = path.resolve(
  import.meta.dirname,
  '../src/offline/service-worker.ts',
)

/**
 * Builds the service worker after Start's prerender, so the shell exists
 * (ADR 0006). It bundles the worker on the Serwist runtime, then injects the
 * precache list: the hashed assets, among them the MapLibre worker, the
 * icons, the web manifest, the shell, and the map's Overview map archive,
 * glyphs and sprites. List it after
 * `tanstackStart()` and `checkPrerenderedHtml()`, which checks the shell.
 */
export const serviceWorker = (): Plugin => ({
  name: 'japan-trip:service-worker',
  apply: 'build',
  enforce: 'post',
  buildApp: {
    order: 'post',
    async handler(builder) {
      const outDir = clientOutDir(builder)
      const bundleDir = path.join(builder.config.root, '.service-worker')
      const fileName = serviceWorkerPath.slice(1)

      await build({
        configFile: false,
        logLevel: 'warn',
        resolve: { tsconfigPaths: true },
        plugins: [checkClientBundle()],
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
            fileName: () => fileName,
          },
        },
      })

      const { count, size, warnings } = await injectManifest({
        swSrc: path.join(bundleDir, fileName),
        swDest: path.join(outDir, fileName),
        globDirectory: outDir,
        globPatterns: [
          'assets/**/*.{js,css,woff2}',
          '*.png',
          'manifest.webmanifest',
          '**/*.html',
          'map/**/*.{pbf,json,png}',
          overviewMapPath.slice(1),
        ],
        // Hashed file names already change with their content.
        dontCacheBustURLsMatching: /^assets\//,
        // The Overview map's archive is the largest file, about 10 MB.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
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
