import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assert, describe, it, onTestFinished } from '@effect/vitest'

import cloudflareConfig from '../cloudflare.config.ts'

const checker = fileURLToPath(
  new URL('./check-cloudflare-config.ts', import.meta.url),
)

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const repoFile = (name: string) => readFileSync(join(repoRoot, name), 'utf8')

const wranglerBin = join(repoRoot, 'node_modules/wrangler/bin/wrangler.js')

const run = (cwd: string) =>
  spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' })

// A throwaway project holding the repository's Cloudflare config files, with
// either replaced. cloudflare.config.ts becomes the plain object the
// repository's config builds, so it needs no packages installed. Its
// worker-configuration.d.ts is what `wrangler types` writes there, before any
// replacement: the output can differ by environment, such as in a sandbox, and
// the repository's own file is checked by the first test.
const project = (
  replace: {
    readonly wrangler?: (jsonc: string) => string
    readonly types?: (types: string) => string
  } = {},
) => {
  const dir = mkdtempSync(join(tmpdir(), 'cloudflare-config-'))

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))

  const wrangler = repoFile('wrangler.jsonc')

  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src/server.ts'), 'export class TripStore {}\n')

  writeFileSync(
    join(dir, 'cloudflare.config.ts'),
    `export default ${JSON.stringify(cloudflareConfig)}\n`,
  )

  writeFileSync(
    join(dir, 'wrangler.jsonc'),
    replace.wrangler ? replace.wrangler(wrangler) : wrangler,
  )

  const typesFile = join(dir, 'worker-configuration.d.ts')

  const typegen = spawnSync(process.execPath, [wranglerBin, 'types'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  })

  assert.strictEqual(typegen.status, 0, typegen.stderr)

  if (replace.types) {
    writeFileSync(typesFile, replace.types(readFileSync(typesFile, 'utf8')))
  }

  return dir
}

// Each run starts Wrangler, which takes seconds when the suite runs in parallel.
describe('check-cloudflare-config', { timeout: 60_000 }, () => {
  it("passes on the repository's Cloudflare files", () => {
    const result = run(repoRoot)

    assert.strictEqual(result.status, 0, result.stderr)
  })

  it('passes on a copy of them', () => {
    const result = run(project())

    assert.strictEqual(result.status, 0, result.stderr)
  })

  it('fails when wrangler.jsonc lacks a secret cloudflare.config.ts declares, naming the path', () => {
    const result = run(
      project({
        wrangler: (jsonc) => jsonc.replace(/"secrets": \{[^}]*\},/, ''),
      }),
    )

    assert.strictEqual(result.status, 1)
    assert.include(
      result.stderr,
      'secrets: cloudflare.config.ts gives {"required":["ACCESS_DEV_SIMULATION"]}, wrangler.jsonc has nothing',
    )
    assert.include(result.stderr, "run 'vp run cf-typegen'")
  })

  it('fails when a variable differs between the two files', () => {
    const result = run(
      project({
        wrangler: (jsonc) =>
          jsonc.replace(
            '"ACCESS_ALLOWED_EMAIL": "phillip@350home.com"',
            '"ACCESS_ALLOWED_EMAIL": "someone@example.com"',
          ),
      }),
    )

    assert.strictEqual(result.status, 1)
    assert.include(
      result.stderr,
      'vars.ACCESS_ALLOWED_EMAIL: cloudflare.config.ts gives "phillip@350home.com", wrangler.jsonc has "someone@example.com"',
    )
  })

  it('fails when worker-configuration.d.ts is not what wrangler types generates', () => {
    const result = run(
      project({
        types: (types) => types.replace('ACCESS_DEV_SIMULATION: string;', ''),
      }),
    )

    assert.strictEqual(result.status, 1)
    assert.include(result.stderr, 'worker-configuration.d.ts is not what')
    assert.include(result.stderr, 'generated: \tACCESS_DEV_SIMULATION: string;')
    assert.include(result.stderr, "Run 'vp run cf-typegen'")
  })
})
