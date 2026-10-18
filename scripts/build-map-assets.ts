// Downloads the glyphs and sprites the map's Protomaps style uses, from a
// pinned commit of protomaps/basemaps-assets, into public/map so the app
// serves them itself. MapLibre draws Japanese and Korean text with the
// device's own font. The script keeps only the other ranges the tiles' labels
// use, and MapLibre draws any character outside them with the device's font.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const commit = '028c18f713baecad011301ff7a69acc39bcc2ae7'

const source = `https://raw.githubusercontent.com/protomaps/basemaps-assets/${commit}`

const output = 'public/map'

const fontstacks = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']

// Basic Latin and Latin-1, Latin Extended-A (macrons such as Tōkyō), Greek,
// Cyrillic, Latin Extended Additional, punctuation, and letterlike symbols
// such as Roman numerals.
const glyphRanges = [0, 256, 768, 1024, 7680, 8192, 8448].map(
  (start) => `${start}-${start + 255}`,
)

const sprites = ['dark.json', 'dark.png', 'dark@2x.json', 'dark@2x.png']

const files = [
  'fonts/OFL.txt',
  ...fontstacks.flatMap((fontstack) =>
    glyphRanges.map((range) => `fonts/${fontstack}/${range}.pbf`),
  ),
  ...sprites.map((sprite) => `sprites/v4/${sprite}`),
]

// Every file downloads, then lands in a staging directory beside public/map,
// which replaces public/map only once every write succeeds. A failed fetch or
// write leaves public/map as it was, never half refreshed.
const downloads = await Promise.all(
  files.map(async (file) => {
    const response = await fetch(`${source}/${encodeURI(file)}`)

    if (!response.ok) throw new Error(`${file} failed: ${response.status}`)

    return [file, Buffer.from(await response.arrayBuffer())] as const
  }),
)

const staging = mkdtempSync(join(dirname(output), '.map-staging-'))

try {
  for (const [file, bytes] of downloads) {
    const path = join(staging, file.replace('sprites/v4/', 'sprites/'))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
  }
} catch (cause) {
  rmSync(staging, { recursive: true, force: true })
  throw cause
}

const previous = `${staging}-previous`

if (existsSync(output)) renameSync(output, previous)

renameSync(staging, output)

rmSync(previous, { recursive: true, force: true })

console.log(`${files.length} files in ${output}`)
