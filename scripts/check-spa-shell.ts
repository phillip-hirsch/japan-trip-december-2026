import { readFile } from 'node:fs/promises'

/**
 * Loader data in the shell's dehydrated router state: a match with a loader
 * result (`l:`), a dehydrated query from the Query integration, or a match
 * below the root route. The root route has no loader, so a clean shell has
 * none of them (ADR 0006).
 */
const loaderDataMarkers = [
  { name: 'route loader data', pattern: /[{,]l:/ },
  {
    name: 'a dehydrated query',
    pattern: /queryHash|dehydratedState|queries:\[/,
  },
  { name: 'a match below the root route', pattern: /\{i:"(?!__root__)/ },
]

/** Why the SPA shell's HTML isn't free of loader data; empty when it is. */
export const shellProblems = (html: string) =>
  loaderDataMarkers.flatMap(({ name, pattern }) =>
    pattern.test(html) ? [`the SPA shell carries ${name}`] : [],
  )

/** Throws, naming each problem, unless the shell at `file` is clean. */
export const checkSpaShell = async (file: string) => {
  const problems = shellProblems(await readFile(file, 'utf8'))

  if (problems.length > 0) {
    throw new Error(`SPA shell check failed:\n- ${problems.join('\n- ')}`)
  }
}

// `node scripts/check-spa-shell.ts <file>` checks a built shell by hand.
if (import.meta.main) {
  const file = process.argv[2]

  if (file === undefined) {
    console.error('Usage: node scripts/check-spa-shell.ts <_shell.html>')
    process.exit(2)
  }

  try {
    await checkSpaShell(file)
    console.log(`${file} carries no loader data`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
