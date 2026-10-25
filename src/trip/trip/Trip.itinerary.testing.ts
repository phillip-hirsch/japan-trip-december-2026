import type { ItineraryContent } from '@/trip/domain/domain'
import { option1 } from '@/trip/itinerary/option-1'

/** Option 1 with the given content in place of its own. */
export const option1With = (
  changes: Partial<ItineraryContent>,
): ItineraryContent => ({
  ...option1,
  ...changes,
})
