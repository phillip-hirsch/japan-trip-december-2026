import { Context, Layer } from 'effect'

import type { ItineraryContent } from '@/trip/domain/domain'
import { option1 } from '@/trip/itinerary/option-1'

/**
 * The Itinerary: Option 1, which the Schedule is created from at store start
 * (ADR 0007). Tests replace it with other content through `fromContent`.
 */
export class Itinerary extends Context.Service<Itinerary, ItineraryContent>()(
  'japan-trip/trip/Itinerary',
) {
  static readonly fromContent = (content: ItineraryContent) =>
    Layer.succeed(Itinerary, content)

  static readonly layer = Itinerary.fromContent(option1)
}
