import type { CSSProperties } from 'react'

export { cn } from 'cn'

/** Inline styles that also define CSS custom properties. */
export type StyleWithVariables = CSSProperties & {
  [name: `--${string}`]: string | number
}
