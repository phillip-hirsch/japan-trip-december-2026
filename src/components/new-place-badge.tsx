import { Badge } from '@/components/ui/badge'
import type { Place } from '@/trip/domain'

/** Marks a Base or Day trip destination Phillip hasn't visited before. */
export function NewPlaceBadge({ place }: { place: Pick<Place, 'newPlace'> }) {
  if (!place.newPlace) return null
  return (
    <Badge variant="outline" className="font-normal">
      New place
    </Badge>
  )
}
