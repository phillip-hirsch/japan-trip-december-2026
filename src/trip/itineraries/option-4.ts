// Converted from docs/itinerary.md, "4. Tokyo → Kyoto → Fukuoka → Tokyo".
import { december } from '@/trip/domain'
import type { ItineraryContent } from '@/trip/domain'
import { shigeharuOpeningDays } from '@/trip/itineraries/shigeharu'

export const option4: ItineraryContent = {
  optionNumber: 4,
  name: 'Kyoto + Fukuoka',
  bestFor: 'Exploring another region and eating exceptionally well',
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
      base: 'fukuoka',
      checkIn: december(13),
      checkOut: december(17),
      accommodation: 'hotel',
      highlights: [
        'Ohori Park',
        'cafés',
        'shopping',
        'ramen',
        'seafood',
        'an evening at the yatai stalls',
      ],
    },
    {
      base: 'tokyo',
      checkIn: december(17),
      checkOut: december(20),
      accommodation: 'hotel',
      highlights: [],
    },
  ],
  days: [
    // "Arrival, recovery, and optional Kamakura": one item per Day of the
    // Stay, in order.
    { date: december(6), description: 'Arrival.' },
    { date: december(7), description: 'Recovery.' },
    { date: december(8), description: 'Optional Kamakura.' },
    { date: december(9) },
    { date: december(10), description: 'Thursday flexibility.' },
    { date: december(11), description: 'Friday morning for Shigeharu.' },
    // The weekend is both Days.
    { date: december(12), description: 'A relaxed weekend.' },
    { date: december(13), description: 'A relaxed weekend.' },
    { date: december(14) },
    { date: december(15), description: 'Birthday dinner.' },
    // "Dazaifu, preferably December 16, for the shrine and surrounding
    // streets."
    {
      date: december(16),
      description: 'Dazaifu, for the shrine and surrounding streets.',
    },
    // "Fly back, then leave room for Enoshima and a free final day": one item
    // per Day of the Stay, in order.
    { date: december(17), description: 'Fly back.' },
    { date: december(18), description: 'Leave room for Enoshima.' },
    // "A free final day": a Free day.
    { date: december(19) },
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
          line: 'tokaido-sanyo-shinkansen',
          from: 'kyoto',
          to: 'hakata',
        },
      ],
      duration: { minMinutes: 165, maxMinutes: 165 },
    },
    // Fukuoka–Haneda. The source never gives the flight's duration.
    { date: december(17), mode: 'flight', sections: [] },
  ],
  dayTrips: [
    { date: december(8), place: 'kamakura', optional: true },
    { date: december(16), place: 'dazaifu', optional: true },
    // "Leave room for Enoshima": offered, not planned, so optional.
    { date: december(18), place: 'enoshima', optional: true },
  ],
  verifyClaims: [shigeharuOpeningDays],
  shigeharuVisit: { date: december(11), slot: 'morning' },
  birthdayOutline:
    'A leisurely Fukuoka day followed by a reserved sushi or other special dinner.',
  pros: [
    'Introduces you to Kyushu while preserving the knife-shopping opportunity.',
    'Excellent for a trip centered on food and relaxed city exploration.',
    'Four nights give you time to enjoy Fukuoka without constant excursions.',
    'Only one domestic flight.',
  ],
  cons: [
    'More airport logistics than the other options.',
    'Less of a traditional garden-and-historic-district experience than Kanazawa.',
    'No dedicated onsen stay.',
    'Nagasaki is excluded to preserve downtime and limit hotel changes.',
  ],
  chooseThisIf:
    'regional food and exploring another major city excite you more than gardens, crafts, or a ryokan.',
  travelNotes:
    'Kyoto–Hakata takes approximately 2 hours 45 minutes by shinkansen. Fly Fukuoka–Haneda on December 17, leaving three nights in Tokyo before your international flight.',
}
