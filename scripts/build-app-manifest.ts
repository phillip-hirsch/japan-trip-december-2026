import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Relative, not '@/': plain `node` runs this script and can't resolve the alias.
import {
  appDescription,
  appName,
  appShortName,
  ink,
} from '../src/lib/app-identity.ts'

// --paper and --vermilion from styles.css, converted to sRGB because resvg
// can't read oklch().
const paper = '#eee7d9'

const vermilion = '#e85336'

const displayFont = 'src/fonts/shippori-mincho-600-display.woff2'

const python = (code: string, args: ReadonlyArray<string>) =>
  execFileSync(
    'uvx',
    [
      '--from',
      'fonttools[woff]==4.67.0',
      '--with',
      'resvg-py==0.5.0',
      '--with',
      'pillow==13.0.0',
      'python',
      '-I',
      '-c',
      code,
      ...args,
    ],
    { encoding: 'utf8' },
  )

const outlineCode = `
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont(sys.argv[1])
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()

def outline(char):
    glyph = glyphs[cmap[ord(char)]]
    path, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
    glyph.draw(path)
    glyph.draw(bounds)
    return {"d": path.getCommands(), "bounds": bounds.bounds}

print(json.dumps({"unitsPerEm": font["head"].unitsPerEm, "glyphs": [outline(c) for c in sys.argv[2]]}))
`

const renderCode = `
import io, sys, resvg_py
from PIL import Image

# Three flat colours and their antialiased edges fit in a 32-colour palette,
# which makes each PNG less than half its full-colour size.
for size, output in zip(sys.argv[2::2], sys.argv[3::2]):
    png = resvg_py.svg_to_bytes(svg_path=sys.argv[1], width=int(size), height=int(size))
    image = Image.open(io.BytesIO(bytes(png))).convert("RGB")
    image.quantize(32, method=Image.Quantize.MEDIANCUT).save(output, optimize=True)
`

interface GlyphOutline {
  readonly d: string
  readonly bounds: readonly [number, number, number, number]
}

// Our own snippet prints this shape, so there is nothing else to check.
const outlines: {
  readonly unitsPerEm: number
  readonly glyphs: ReadonlyArray<GlyphOutline>
} = JSON.parse(python(outlineCode, [displayFont, '日本']))

const round = (value: number) => Math.round(value * 100) / 100

// The icon is a 512 square with the sidebar's 日本 in paper white under a
// vermilion sun, on ink. Everything sits inside the maskable safe zone, the
// central circle of radius 0.4, so one PNG works as both any and maskable.
const glyphSize = 144

const sunRadius = 38

const gap = 44

const scale = glyphSize / outlines.unitsPerEm

const glyphTop = Math.max(...outlines.glyphs.map(({ bounds }) => bounds[3]))

const glyphBottom = Math.min(...outlines.glyphs.map(({ bounds }) => bounds[1]))

const top = (512 - (2 * sunRadius + gap + (glyphTop - glyphBottom) * scale)) / 2

const baseline = top + 2 * sunRadius + gap + glyphTop * scale

const glyphPaths = outlines.glyphs.map(({ d, bounds }, index) => {
  const centreX = 256 + (index === 0 ? -1 : 1) * glyphSize * 0.53
  const x = centreX - ((bounds[0] + bounds[2]) / 2) * scale

  return `<path transform="translate(${round(x)} ${round(baseline)}) scale(${round(scale)} ${-round(scale)})" d="${d}"/>`
})

const icon = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
  `<rect width="512" height="512" fill="${ink}"/>`,
  `<circle cx="256" cy="${round(top + sunRadius)}" r="${sunRadius}" fill="${vermilion}"/>`,
  `<g fill="${paper}">${glyphPaths.join('')}</g>`,
  '</svg>',
  '',
].join('\n')

const manifest = {
  id: '/',
  name: appName,
  short_name: appShortName,
  description: appDescription,
  lang: 'en',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: ink,
  theme_color: ink,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}

const work = mkdtempSync(join(tmpdir(), 'app-icons-'))

const drawing = join(work, 'icon.svg')

writeFileSync(drawing, icon)

// The Apple touch icon goes in src/ because __root.tsx inlines it. Safari
// fetches link icons without cookies, and Access would answer with its login page.
python(renderCode, [
  drawing,
  '192',
  'public/icon-192.png',
  '512',
  'public/icon-512.png',
  '180',
  'src/icons/apple-touch-icon.png',
])

writeFileSync(
  'public/manifest.webmanifest',
  `${JSON.stringify(manifest, null, 2)}\n`,
)
