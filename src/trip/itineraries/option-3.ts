// Converted from docs/itinerary.md, "3. Tokyo → Kyoto → Tokyo".
import { december, VerifyClaimAttachment } from '@/trip/domain'
import type { ItineraryContent } from '@/trip/domain'
import { shigeharuOpeningDays } from '@/trip/itineraries/shigeharu'

export const option3: ItineraryContent = {
  optionNumber: 3,
  name: 'Tokyo + Kyoto',
  bestFor: 'Fewest moves and all three suggested day trips',
  recommended: false,
  stays: [
    {
      base: 'tokyo',
      checkIn: december(6),
      checkOut: december(9),
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'kyoto',
      checkIn: december(9),
      checkOut: december(13),
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'tokyo',
      checkIn: december(13),
      checkOut: december(20),
      accommodation: 'hotel',
      highlights: [],
    },
  ],
  days: [
    // "Arrival, jet-lag recovery, and relaxed neighborhood time": one item
    // per Day of the Stay, in order.
    { date: december(6), description: 'Arrival.' },
    { date: december(7), description: 'Jet-lag recovery.' },
    { date: december(8), description: 'Relaxed neighborhood time.' },
    { date: december(9) },
    { date: december(10), description: 'Thursday flexibility.' },
    { date: december(11), description: 'Friday morning for Shigeharu.' },
    { date: december(12), description: 'An easy Saturday.' },
    { date: december(13) },
    // December 14–19 come from the source's day-by-day table.
    { date: december(14), description: 'Kamakura.' },
    { date: december(15), description: 'Birthday in Tokyo.' },
    { date: december(16), description: 'Nikko.' },
    // "Unscheduled Tokyo day": a Free day.
    { date: december(17) },
    { date: december(18), description: 'Enoshima afternoon and evening.' },
    {
      date: december(19),
      description: 'Shopping, favorite food, and packing.',
    },
    { date: december(20) },
  ],
  moves: [
    {
      date: december(9),
      mode: 'train',
      sections: [
        {
          mode: 'shinkansen',
          line: 'tokaido-shinkansen',
          from: 'tokyo',
          to: 'kyoto',
        },
      ],
      // Reused from Option 1's "Tokyo–Kyoto is approximately 2¼ hours".
      duration: { minMinutes: 135, maxMinutes: 135 },
    },
    {
      date: december(13),
      mode: 'train',
      sections: [
        {
          mode: 'shinkansen',
          line: 'tokaido-shinkansen',
          from: 'kyoto',
          to: 'tokyo',
        },
      ],
      // Reused from Option 1's "Tokyo–Kyoto is approximately 2¼ hours".
      duration: { minMinutes: 135, maxMinutes: 135 },
    },
  ],
  dayTrips: [
    { date: december(14), place: 'kamakura', optional: false },
    { date: december(16), place: 'nikko', optional: false },
    { date: december(18), place: 'enoshima', optional: false },
  ],
  verifyClaims: [
    shigeharuOpeningDays,
    {
      id: 'nikko-toshogu-winter-hours',
      text: 'Toshogu closes at 16:00 in winter.',
      attachedTo: VerifyClaimAttachment.cases.Day.make({ date: december(16) }),
    },
    {
      id: 'enoshima-winter-illumination',
      text: 'Enoshima’s announced winter illumination dates cover your trip, making it a good afternoon-and-evening excursion.',
      attachedTo: VerifyClaimAttachment.cases.Day.make({ date: december(18) }),
    },
  ],
  shigeharuVisit: { date: december(11), slot: 'morning' },
  birthdayOutline:
    'Sleep in, choose one enjoyable activity, and reserve a special dinner. You have no travel obligation that day.',
  pros: [
    'Only two hotel moves.',
    'Includes Kamakura, Enoshima, Nikko, and the Shigeharu opportunity.',
    'Easy to rearrange excursions around weather and energy.',
    'Plenty of time to explore Tokyo beyond places you’ve already seen.',
  ],
  cons: [
    'Every overnight base is somewhere you have already visited.',
    'Several day trips still involve considerable train time, especially Nikko.',
    'No ryokan retreat or extended stay in a new region.',
  ],
  chooseThisIf:
    'freedom and minimal packing matter more than staying somewhere new.',
  // The source gives Option 3 no "Travel" paragraph.
}
