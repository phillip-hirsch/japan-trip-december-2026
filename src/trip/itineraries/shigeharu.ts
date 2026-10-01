// Converted from docs/itinerary.md, the paragraph before the Options: it builds
// Shigeharu into every Itinerary, so each one carries this Verify claim.
import { december } from '@/trip/domain'
import type { VerifyClaim } from '@/trip/domain'

export const shigeharuOpeningDays: VerifyClaim = {
  id: 'shigeharu-opening-days',
  text: 'Recent visitor reports favor Friday mornings, with occasional Thursday openings, but this remains an observed pattern rather than a confirmed December schedule. Keep that morning flexible and have your agent or hotel confirm directly.',
  attachedTo: { _tag: 'Day', date: december(11) },
}
