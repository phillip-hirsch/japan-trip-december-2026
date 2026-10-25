import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import type { Plugin, ViteBuilder } from 'vite-plus'

import { pageFile, shellPath } from '../src/offline/shell.ts'
import { shellProblems } from './check-spa-shell.ts'

/**
 * Where a page's HTML lands with TanStack Start's `autoSubfolderIndex` off:
 * the shell at `/_shell` becomes `_shell.html`.
 */
const htmlFile = (pagePath: string) => pageFile(pagePath).slice(1)

/** The client build's output directory, where the build writes the pages. */
export const clientOutDir = (builder: ViteBuilder) =>
  path.resolve(
    builder.config.root,
    builder.environments.client.config.build.outDir,
  )

const leakedEmailAddress = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/i

const pageProblems = (file: string, html: string) => [
  ...(leakedEmailAddress.test(html)
    ? [`${file} contains an email address`]
    : []),
  ...(file === htmlFile(shellPath) ? shellProblems(html) : []),
]

/**
 * Fails the build unless the client output holds exactly one page, the SPA
 * shell, with no email address and no loader data (ADR 0006). It must follow
 * TanStack Start's prerender, which is also an enforce-post, order-post
 * `buildApp` hook, so list it after `tanstackStart()`.
 */
export const checkPrerenderedHtml = (): Plugin => ({
  name: 'japan-trip:check-prerendered-html',
  apply: 'build',
  enforce: 'post',
  buildApp: {
    order: 'post',
    async handler(builder) {
      const outDir = clientOutDir(builder)

      const expected = [htmlFile(shellPath)]

      const found = (await readdir(outDir, { recursive: true }))
        .filter((file) => file.endsWith('.html'))
        .map((file) => file.split(path.sep).join('/'))

      const contentProblems = await Promise.all(
        found.map(async (file) =>
          pageProblems(file, await readFile(path.join(outDir, file), 'utf8')),
        ),
      )

      const problems = [
        ...expected.flatMap((file) =>
          !found.includes(file) ? [`${file} is missing`] : [],
        ),
        ...found.flatMap((file) =>
          !expected.includes(file)
            ? [`${file} is not a page meant to be prerendered`]
            : [],
        ),
        ...contentProblems.flat(),
      ]

      if (problems.length > 0) {
        throw new Error(
          `Prerendered HTML check failed:\n- ${problems.join('\n- ')}`,
        )
      }
    },
  },
})
