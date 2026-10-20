import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assert, describe, it, onTestFinished } from '@effect/vitest'

const checker = fileURLToPath(new URL('./check-spa-shell.ts', import.meta.url))

// The dehydrated router state as Start writes it into the shell, trimmed.
const rootMatch = '{i:"__root__#",u:1792463392116,s:"success",ssr:!0}'

const homeMatch =
  '{i:"##",u:1792463427145,s:"success",l:$R[13]={_tag:"BeforeTrip"}}'

const homeQuery = 'queryKey:$R[129]=["home"],queryHash:"[\\"home\\"]"'

const shell = (matches: ReadonlyArray<string>, queries = '') =>
  `<!DOCTYPE html><html><body><script>$_TSR.router=($R=>$R[0]={matches:$R[8]=[${matches.join(',')}],dehydratedData:$R[10]={query:$R[11]={${queries}}}})($R["tsr"])</script></body></html>`

const check = (html: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'spa-shell-'))

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))

  const file = join(dir, '_shell.html')

  writeFileSync(file, html)

  return spawnSync(process.execPath, [checker, file], { encoding: 'utf8' })
}

describe('the SPA shell check', () => {
  it('passes a shell holding only the root route', () => {
    const result = check(shell([rootMatch]))

    assert.strictEqual(result.status, 0)
    assert.include(result.stdout, 'carries no loader data')
  })

  it('fails a shell carrying route loader data and a match below the root route', () => {
    const result = check(shell([rootMatch, homeMatch]))

    assert.strictEqual(result.status, 1)
    assert.include(result.stderr, 'the SPA shell carries route loader data')
    assert.include(
      result.stderr,
      'the SPA shell carries a match below the root route',
    )
  })

  it('fails a shell carrying a dehydrated query', () => {
    const result = check(shell([rootMatch], homeQuery))

    assert.strictEqual(result.status, 1)
    assert.include(result.stderr, 'the SPA shell carries a dehydrated query')
    assert.notInclude(result.stderr, 'route loader data')
  })
})
