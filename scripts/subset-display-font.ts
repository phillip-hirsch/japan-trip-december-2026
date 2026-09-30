// Regenerates the Shippori Mincho display subset from the curated display
// strings plus printable ASCII. Needs `uv` (for fonttools) and network access.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Relative, not '@/': plain `node` runs this script and can't resolve the alias.
import { displayStrings } from '../src/fonts/display-strings.ts'

const source =
  'https://raw.githubusercontent.com/google/fonts/d0b2d1307ad5d6b579d627a6e5abd25952484b96/ofl/shipporimincho/ShipporiMincho-SemiBold.ttf'
const output = 'src/fonts/shippori-mincho-600-display.woff2'

const work = mkdtempSync(join(tmpdir(), 'display-font-'))
const ttf = join(work, 'ShipporiMincho-SemiBold.ttf')
const text = join(work, 'display-strings.txt')

const response = await fetch(source)
if (!response.ok) throw new Error(`Font download failed: ${response.status}`)
writeFileSync(ttf, Buffer.from(await response.arrayBuffer()))
writeFileSync(text, displayStrings.join(''))

execFileSync(
  'uvx',
  [
    '--from',
    'fonttools[woff]',
    'pyftsubset',
    ttf,
    `--text-file=${text}`,
    '--unicodes=U+0020-007E',
    '--flavor=woff2',
    '--no-hinting',
    '--desubroutinize',
    `--output-file=${output}`,
  ],
  { stdio: 'inherit' },
)
