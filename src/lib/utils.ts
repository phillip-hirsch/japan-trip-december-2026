import type { CSSProperties } from 'react'

export { cn } from 'cn'

export type StyleWithVariables = CSSProperties & {
  [name: `--${string}`]: string | number
}
