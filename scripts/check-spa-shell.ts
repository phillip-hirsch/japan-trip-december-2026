import { readFile } from 'node:fs/promises'

/**
 * What must never reach the shell's dehydrated router state: a match with a
 * loader result (`l:`), a dehydrated query from the Query integration, or a
 * match below the root route. The root route has no loader, so a clean shell
 * has none of them (ADR 0006).
 */
const shellLeaks = [
  { name: 'route loader data', pattern: /[{,]l:/ },
  {
    name: 'a dehydrated query',
    pattern: /queryHash|dehydratedState|queries:\[/,
  },
  { name: 'a match below the root route', pattern: /\{i:"(?!__root__)/ },
]

/** What the SPA shell's HTML carries that it mustn't; empty when clean. */
export const shellProblems = (html: string) =>
  shellLeaks.flatMap(({ name, pattern }) =>
    pattern.test(html) ? [`the SPA shell carries ${name}`] : [],
  )

// The build runs the check through scripts/prerender.ts; this checks a built
// shell by hand: `node scripts/check-spa-shell.ts <_shell.html>`.
if (import.meta.main) {
  const file = process.argv[2]

  if (file === undefined) {
    console.error('Usage: node scripts/check-spa-shell.ts <_shell.html>')
    process.exit(2)
  }

  const problems = shellProblems(await readFile(file, 'utf8'))

  if (problems.length > 0) {
    console.error(`SPA shell check failed:\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }

  console.log(`${file} carries no loader data`)
}
