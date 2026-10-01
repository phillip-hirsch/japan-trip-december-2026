// Converted from docs/itinerary.md, "2. Tokyo → Kyoto → Hakone → Tokyo".
import { december } from '@/trip/domain'
import type { ItineraryContent } from '@/trip/domain'
import { shigeharuOpeningDays } from '@/trip/itineraries/shigeharu'

export const option2: ItineraryContent = {
  optionNumber: 2,
  name: 'Kyoto + Hakone',
  bestFor: 'A relaxing birthday retreat',
  recommended: false,
  stays: [
    {
      base: 'tokyo',
      checkIn: december(6),
      checkOut: december(10),
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'kyoto',
      checkIn: december(10),
      checkOut: december(14),
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'hakone',
      checkIn: december(14),
      checkOut: december(17),
      accommodation: 'ryokan',
      highlights: [],
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
    // "Arrival, recovery, Kamakura, and an easy Tokyo day": one item per Day
    // of the Stay, in order.
    { date: december(6), description: 'Arrival.' },
    { date: december(7), description: 'Recovery.' },
    { date: december(8), description: 'Kamakura.' },
    { date: december(9), description: 'An easy Tokyo day.' },
    { date: december(10), description: 'Arrive Thursday.' },
    { date: december(11), description: 'Target Shigeharu Friday morning.' },
    // The weekend is both Days.
    {
      date: december(12),
      description: 'Leave the weekend lightly planned, with optional Uji.',
    },
    {
      date: december(13),
      description: 'Leave the weekend lightly planned, with optional Uji.',
    },
    { date: december(14), description: 'Arrive the day before your birthday.' },
    // From the Birthday paragraph, which also names December 16.
    {
      date: december(15),
      description:
        'Breakfast, hot springs, a short walk, more relaxation, and dinner at the ryokan.',
    },
    {
      date: december(16),
      description:
        'Your sightseeing day—perhaps the Open-Air Museum or a lake/ropeway outing, depending on conditions.',
    },
    { date: december(17) },
    // The Stay's row names no Day for these, so both whole Days carry them.
    {
      date: december(18),
      description: 'Optional Enoshima, shopping, and rest before departure.',
    },
    {
      date: december(19),
      description: 'Optional Enoshima, shopping, and rest before departure.',
    },
    { date: december(20) },
  ],
  moves: [
    {
      date: december(10),
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
      date: december(14),
      mode: 'train',
      // "Through Odawara". The source doesn't say how the rest of the way to
      // Hakone goes.
      sections: [
        {
          mode: 'shinkansen',
          line: 'tokaido-shinkansen',
          from: 'kyoto',
          to: 'odawara',
        },
      ],
      // "3½–4½ hours hotel to hotel".
      duration: { minMinutes: 210, maxMinutes: 270 },
    },
    // The source gives neither the route nor the duration.
    { date: december(17), mode: 'train', sections: [] },
  ],
  dayTrips: [
    { date: december(8), place: 'kamakura', optional: false },
    // "Optional Uji" on a weekend that names no Day, so on both.
    { date: december(12), place: 'uji', optional: true },
    { date: december(13), place: 'uji', optional: true },
    // "Optional Enoshima" in a Stay that names no Day, so on both whole Days.
    { date: december(18), place: 'enoshima', optional: true },
    { date: december(19), place: 'enoshima', optional: true },
  ],
  verifyClaims: [shigeharuOpeningDays],
  shigeharuVisit: { date: december(11), slot: 'morning' },
  birthdayOutline:
    'Breakfast, hot springs, a short walk, more relaxation, and dinner at the ryokan. December 16 can be your sightseeing day—perhaps the Open-Air Museum or a lake/ropeway outing, depending on conditions.',
  pros: [
    'The most deliberate, relaxing birthday experience.',
    'Shigeharu fits naturally before the ryokan stay.',
    'Three nights in Hakone provide two full days without packing.',
    'Good balance of city time and a quieter setting.',
  ],
  cons: [
    'Less exploration of a new urban destination than Options 1 or 4.',
    'Three ryokan nights can take a substantial share of the budget.',
    'Best suited to someone who enjoys bathing, leisurely meals, and time at the accommodation.',
    'Nikko is omitted.',
  ],
  // The source reads "Choose this over Option 1 if".
  chooseThisIf:
    'your ideal birthday is a retreat, and that matters more than discovering another city.',
  travelNotes:
    'Hakone fits on the return toward Tokyo through Odawara. Allow approximately 3½–4½ hours hotel to hotel from Kyoto, depending on the train connection and ryokan location.',
}
