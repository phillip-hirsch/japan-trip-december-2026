import { cn } from '@/lib/utils'
import type { DisplayString } from '@/fonts/display-strings'

/**
 * A curated Japanese display string, set in the display serif. Only strings
 * in the curated list type-check, because the display font is subset to them.
 */
export function DisplayJa({
  text,
  className,
}: {
  text: DisplayString
  className?: string
}) {
  return (
    <span lang="ja" className={cn('font-heading', className)}>
      {text}
    </span>
  )
}
