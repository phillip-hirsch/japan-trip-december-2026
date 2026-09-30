import { DisplayJa } from '@/components/display-ja'
import { cn } from '@/lib/utils'
import type { Place } from '@/trip/domain'

/** A place in kanji followed by its romaji name. */
export function PlaceName({
  place,
  className,
}: {
  place: Pick<Place, 'kanji' | 'romaji'>
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <DisplayJa text={place.kanji} />
      <span>{place.romaji}</span>
    </span>
  )
}
