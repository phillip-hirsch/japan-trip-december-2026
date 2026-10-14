import { cn } from '@/lib/utils'
import type { DisplayString } from '@/fonts/display-strings'

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
