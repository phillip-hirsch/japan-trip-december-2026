/**
 * The curated Japanese strings set in Shippori Mincho. The display font is
 * subset to exactly these characters plus printable ASCII, so any other
 * Japanese text falls back to the system font.
 *
 * After changing this list, run `vp run subset-display-font` and commit the
 * regenerated woff2.
 */
export const displayStrings = [
  // Bases
  '東京',
  '京都',
  '金沢',
  '箱根',
  '福岡',
  // Day trip destinations
  '鎌倉',
  '日光',
  '江ノ島',
  '宇治',
  '太宰府',
  // Places visited on previous trips
  '大阪',
  '広島',
  // Home
  '日本',
  'あと',
  '日',
] as const

export type DisplayString = (typeof displayStrings)[number]
