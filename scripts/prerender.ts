// The build's prerendering: which pages, and the check on their HTML.
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { Effect } from 'effect'
import type { Plugin } from 'vite-plus'

import { readTrip } from './trip.ts'

/**
 * The pages the build prerenders, listed rather than crawled: the comparison
 * page and every Itinerary's page, from the catalogue. Home depends on the
 * date, so it stays dynamic.
 */
export const readPrerenderedPaths = () =>
  readTrip((trip) =>
    Effect.map(trip.itineraries, (itineraries) => [
      '/options',
      ...itineraries.map(({ optionNumber }) => `/options/${optionNumber}`),
    ]),
  )

/**
 * Where a page's HTML lands with TanStack Start's `autoSubfolderIndex` off:
 * `/options/1` becomes `options/1.html`, which Workers static assets serve at
 * `/options/1` without a trailing-slash redirect.
 */
const htmlFile = (pagePath: string) => `${pagePath.slice(1)}.html`

// The verified email in the request context is the personal state a
// prerendered page could leak, so no email address may appear at all.
const emailAddress = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/i

// Links to the comparison page or an Itinerary page, all of which are
// prerendered.
const optionsLink = /href="(\/options[^"?#]*)"/g

/** What's wrong with one prerendered page's HTML. */
const pageProblems = (
  prerenderedPaths: ReadonlyArray<string>,
  file: string,
  html: string,
) => [
  ...(emailAddress.test(html) ? [`${file} contains an email address`] : []),
  ...[...html.matchAll(optionsLink)].flatMap(([, href]) =>
    !prerenderedPaths.includes(href)
      ? [`${file} links to ${href}, which isn't prerendered`]
      : [],
  ),
]

/**
 * Fails the build unless the client output holds exactly the prerendered
 * pages, none containing an email address or linking to an Itinerary page
 * that isn't prerendered. It must follow TanStack Start's prerender, which is
 * also an enforce-post, order-post `buildApp` hook, so list it after
 * `tanstackStart()`.
 */
export const checkPrerenderedHtml = (
  prerenderedPaths: ReadonlyArray<string>,
): Plugin => ({
  name: 'japan-trip:check-prerendered-html',
  apply: 'build',
  enforce: 'post',
  buildApp: {
    order: 'post',
    async handler(builder) {
      const outDir = path.resolve(
        builder.config.root,
        builder.environments.client.config.build.outDir,
      )

      const expected = prerenderedPaths.map(htmlFile)

      const found = (await readdir(outDir, { recursive: true }))
        .filter((file) => file.endsWith('.html'))
        .map((file) => file.split(path.sep).join('/'))

      const contentProblems = await Promise.all(
        found.map(async (file) =>
          pageProblems(
            prerenderedPaths,
            file,
            await readFile(path.join(outDir, file), 'utf8'),
          ),
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
