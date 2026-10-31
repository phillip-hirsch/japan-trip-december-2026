import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assert, describe, it, onTestFinished } from '@effect/vitest'

const checker = fileURLToPath(
  new URL('./check-effect-versions.ts', import.meta.url),
)

const run = (packageFile?: string) =>
  spawnSync(
    process.execPath,
    [checker, ...(packageFile ? [packageFile] : [])],
    {
      encoding: 'utf8',
    },
  )

// Writes a throwaway package.json with these dependencies.
const manifest = (
  dependencies: Record<string, string>,
  devDependencies: Record<string, string> = {},
) => {
  const dir = mkdtempSync(join(tmpdir(), 'effect-versions-'))

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))

  const file = join(dir, 'package.json')

  writeFileSync(file, JSON.stringify({ dependencies, devDependencies }))

  return file
}

describe('check-effect-versions', () => {
  it("passes on the repository's package.json", () => {
    const result = run()

    assert.strictEqual(result.status, 0, result.stderr)
  })

  it('passes when effect, @effect/vitest and the SQL drivers share one exact version', () => {
    const result = run(
      manifest(
        { effect: '4.0.6', '@effect/sql-sqlite-do': '4.0.6' },
        {
          '@effect/vitest': '4.0.6',
          '@effect/sql-sqlite-node': '4.0.6',
          '@effect/tsgo': '0.57.0',
        },
      ),
    )

    assert.strictEqual(result.status, 0, result.stderr)
  })

  it('fails when a SQL driver drifts from effect, and lists every pinned version', () => {
    const result = run(
      manifest(
        { effect: '4.0.6', '@effect/sql-sqlite-do': '4.0.7' },
        { '@effect/vitest': '4.0.6' },
      ),
    )

    assert.strictEqual(result.status, 1)
    assert.include(result.stderr, '@effect/sql-sqlite-do: 4.0.7')
    assert.include(result.stderr, 'effect: 4.0.6')
    assert.include(result.stderr, 'such as "4.0.6"')
  })

  it('fails on a range, even when every version matches', () => {
    const result = run(
      manifest({ effect: '^4.0.6' }, { '@effect/vitest': '^4.0.6' }),
    )

    assert.strictEqual(result.status, 1)
    assert.include(result.stderr, 'with no ^ or ~')
  })

  it('ignores @effect/tsgo, which has its own version', () => {
    const result = run(
      manifest({ effect: '4.0.6' }, { '@effect/tsgo': '^0.57.0' }),
    )

    assert.strictEqual(result.status, 0, result.stderr)
  })
})
