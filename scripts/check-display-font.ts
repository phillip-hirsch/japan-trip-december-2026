import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'

// Checks that the display font's subset holds exactly the characters of
// src/fonts/display-strings.ts plus printable ASCII, the set
// scripts/subset-display-font.ts asks pyftsubset for. It reads the font's
// cmap, so it needs neither uv nor the network. Tests pass another font and
// strings module.
const fontFile =
  process.argv[2] ?? 'src/fonts/shippori-mincho-600-display.woff2'

const stringsFile = process.argv[3] ?? 'src/fonts/display-strings.ts'

// The WOFF2 table tags by their known-tag index (WOFF2 spec, 5.1).
const knownTags = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
]

/** The decompressed cmap table of a WOFF2 font. */
const cmapTable = (font: Buffer) => {
  if (font.toString('latin1', 0, 4) !== 'wOF2') {
    throw new Error(`${fontFile} is not a WOFF2 font`)
  }

  const numTables = font.readUInt16BE(12)
  const compressedLength = font.readUInt32BE(20)
  let offset = 48

  // UIntBase128 (WOFF2 spec, 4.1).
  const readBase128 = () => {
    let value = 0

    for (let i = 0; i < 5; i++) {
      const byte = font.readUInt8(offset++)
      value = value * 128 + (byte & 0x7f)

      if ((byte & 0x80) === 0) return value
    }

    throw new Error(`${fontFile} has a malformed table directory`)
  }

  const tables = Array.from({ length: numTables }, () => {
    const flags = font.readUInt8(offset++)
    const tagIndex = flags & 0x3f

    const tag =
      tagIndex === 0x3f
        ? font.toString('latin1', offset, (offset += 4))
        : knownTags[tagIndex]

    const length = readBase128()
    const transform = flags >> 6

    // glyf and loca are transformed at version 0; every other table at any
    // version but 0. A transformed table records its stored length.
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transform === 0 : transform !== 0

    return { tag, length: transformed ? readBase128() : length }
  })

  const data = brotliDecompressSync(
    font.subarray(offset, offset + compressedLength),
  )

  let start = 0

  for (const { tag, length } of tables) {
    if (tag === 'cmap') return data.subarray(start, start + length)
    start += length
  }

  throw new Error(`${fontFile} has no cmap table`)
}

/** Every code point a Unicode cmap subtable maps to a glyph. */
const mappedCodePoints = (cmap: Buffer) => {
  const codePoints = new Set<number>()
  const count = cmap.readUInt16BE(2)

  for (let i = 0; i < count; i++) {
    const record = 4 + i * 8
    const platform = cmap.readUInt16BE(record)
    const table = cmap.subarray(cmap.readUInt32BE(record + 4))

    // Unicode (0) and Windows (3) subtables map code points.
    if (platform !== 0 && platform !== 3) continue

    const format = table.readUInt16BE(0)

    if (format === 4) {
      const segments = table.readUInt16BE(6) / 2
      const ends = 14
      const starts = ends + segments * 2 + 2
      const deltas = starts + segments * 2
      const rangeOffsets = deltas + segments * 2

      for (let s = 0; s < segments; s++) {
        const first = table.readUInt16BE(starts + s * 2)
        const last = table.readUInt16BE(ends + s * 2)
        const delta = table.readUInt16BE(deltas + s * 2)
        const rangeOffset = table.readUInt16BE(rangeOffsets + s * 2)

        for (let c = first; c <= last && c !== 0xffff; c++) {
          const indexed =
            rangeOffset === 0
              ? c
              : table.readUInt16BE(
                  rangeOffsets + s * 2 + rangeOffset + (c - first) * 2,
                )

          const glyph =
            rangeOffset !== 0 && indexed === 0 ? 0 : (indexed + delta) & 0xffff

          if (glyph !== 0) codePoints.add(c)
        }
      }
    } else if (format === 12) {
      const groups = table.readUInt32BE(12)

      for (let g = 0; g < groups; g++) {
        const group = 16 + g * 12
        const last = table.readUInt32BE(group + 4)

        for (let c = table.readUInt32BE(group); c <= last; c++) {
          codePoints.add(c)
        }
      }
    }
  }

  return codePoints
}

const { displayStrings }: { readonly displayStrings: ReadonlyArray<string> } =
  await import(pathToFileURL(resolve(stringsFile)).href)

const printableAscii = Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i)

const expected = new Set([
  ...printableAscii,
  ...[...displayStrings.join('')].map((char) => char.codePointAt(0) ?? 0),
])

const found = mappedCodePoints(cmapTable(readFileSync(fontFile)))

const describe = (codePoint: number) =>
  `${String.fromCodePoint(codePoint)} (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')})`

const sorted = (codePoints: ReadonlyArray<number>) =>
  [...codePoints].sort((a, b) => a - b).map(describe)

const missing = sorted([...expected].filter((c) => !found.has(c)))

const extra = sorted([...found].filter((c) => !expected.has(c)))

if (missing.length > 0 || extra.length > 0) {
  console.error(`
Display font check failed. ${fontFile} is not subset to ${stringsFile} plus printable ASCII.
${missing.length > 0 ? `\n  Missing from the font: ${missing.join(', ')}` : ''}${extra.length > 0 ? `\n  In the font but in no display string: ${extra.join(', ')}` : ''}

Run 'vp run subset-display-font' (it needs uv and the network) and commit the regenerated woff2. Then run 'vp run build-app-manifest', since the Home Screen icons draw 日本 from this font, and commit its output too.
`)

  process.exitCode = 1
}
