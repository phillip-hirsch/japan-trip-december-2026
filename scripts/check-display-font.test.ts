import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assert, describe, it, onTestFinished } from '@effect/vitest'

import { displayStrings } from '../src/fonts/display-strings.ts'

const checker = fileURLToPath(
  new URL('./check-display-font.ts', import.meta.url),
)

const committedFont = fileURLToPath(
  new URL('../src/fonts/shippori-mincho-600-display.woff2', import.meta.url),
)

const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), 'display-font-'))

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))

  return dir
}

// A throwaway display-strings.ts holding these strings.
const stringsModule = (strings: ReadonlyArray<string>) => {
  const file = join(sandbox(), 'display-strings.ts')

  writeFileSync(
    file,
    `export const displayStrings = ${JSON.stringify(strings)}\n`,
  )

  return file
}

const run = (...args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8' })

describe('check-display-font', () => {
  it('passes on the committed font and display strings', () => {
    const result = run()

    assert.strictEqual(result.status, 0, result.stderr)
  })

  it('fails when a display string has a character the font lacks, and says how to regenerate it', () => {
    const result = run(
      committedFont,
      stringsModule([...displayStrings, '大阪']),
    )

    assert.strictEqual(result.status, 1)
    assert.include(
      result.stderr,
      'Missing from the font: 大 (U+5927), 阪 (U+962A)',
    )
    assert.include(result.stderr, "Run 'vp run subset-display-font'")
    assert.include(result.stderr, "'vp run build-app-manifest'")
  })

  it('fails when the font keeps characters no display string uses', () => {
    const result = run(
      committedFont,
      stringsModule(displayStrings.filter((text) => text !== '鎌倉')),
    )

    assert.strictEqual(result.status, 1)
    assert.include(
      result.stderr,
      'In the font but in no display string: 倉 (U+5009), 鎌 (U+938C)',
    )
  })

  it('fails on a file that is not a WOFF2 font', () => {
    const notAFont = join(sandbox(), 'font.woff2')

    writeFileSync(notAFont, 'not a font')

    const result = run(notAFont, stringsModule(displayStrings))

    assert.strictEqual(result.status, 1)
    assert.include(result.stderr, 'is not a WOFF2 font')
  })
})
