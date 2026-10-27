import { VerifyClaimAttachment } from '@/trip/domain/domain'
import type { ItineraryContent } from '@/trip/domain/domain'
import { option1 } from '@/trip/itinerary/option-1'

export const option1WithEveryAttachment: ItineraryContent = {
  ...option1,
  verifyClaims: [
    ...option1.verifyClaims,
    {
      id: 'rail-pass',
      text: 'Rail pass prices change in October.',
      attachedTo: VerifyClaimAttachment.cases.Itinerary.make({}),
    },
  ],
}
