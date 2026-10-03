// Converted from docs/itinerary.md, "1. Tokyo → Kyoto → Kanazawa → Tokyo".
import { december, VerifyClaimAttachment } from '@/trip/domain'
import type { ItineraryContent } from '@/trip/domain'
import { shigeharuOpeningDays } from '@/trip/itineraries/shigeharu'

export const option1: ItineraryContent = {
  optionNumber: 1,
  name: 'Kyoto + Kanazawa',
  bestFor: 'Best overall balance of discovery, food, and Shigeharu',
  recommended: true,
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
      base: 'kanazawa',
      checkIn: december(13),
      checkOut: december(17),
      accommodation: 'hotel',
      highlights: [
        'Kenrokuen',
        'the castle grounds',
        'Higashi Chaya',
        'craft shops',
        'Omicho Market',
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
    { date: december(6), description: 'Arrival evening.' },
    { date: december(7), description: 'A recovery day.' },
    { date: december(8), description: 'Kamakura.' },
    { date: december(9), description: 'Arrive Wednesday.' },
    { date: december(10), description: 'Keep Thursday flexible.' },
    { date: december(11), description: 'Friday morning for Shigeharu.' },
    { date: december(12), description: 'Uji or a leisurely Kyoto day.' },
    { date: december(13) },
    { date: december(14) },
    { date: december(15), description: 'Your birthday dinner.' },
    { date: december(16) },
    { date: december(17) },
    { date: december(18), description: 'Optional Enoshima afternoon/evening.' },
    { date: december(19), description: 'Shopping and relaxing.' },
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
      duration: { minMinutes: 135, maxMinutes: 135 },
    },
    {
      date: december(13),
      mode: 'train',
      sections: [
        {
          mode: 'limited-express',
          line: 'thunderbird',
          from: 'kyoto',
          to: 'tsuruga',
        },
        {
          mode: 'shinkansen',
          line: 'hokuriku-shinkansen',
          from: 'tsuruga',
          to: 'kanazawa',
        },
      ],
      duration: { minMinutes: 120, maxMinutes: 120 },
    },
    {
      date: december(17),
      mode: 'train',
      sections: [
        {
          mode: 'shinkansen',
          line: 'hokuriku-shinkansen',
          from: 'kanazawa',
          to: 'tokyo',
        },
      ],
      duration: { minMinutes: 150, maxMinutes: 150 },
    },
  ],
  dayTrips: [
    { date: december(8), place: 'kamakura', optional: false },
    // "Uji or a leisurely Kyoto day": an either-or, so optional.
    { date: december(12), place: 'uji', optional: true },
    { date: december(18), place: 'enoshima', optional: true },
  ],
  verifyClaims: [
    shigeharuOpeningDays,
    {
      id: 'kanazawa-crab-season',
      text: 'December also falls within local crab season, which makes a special seafood dinner an appealing birthday plan.',
      attachedTo: VerifyClaimAttachment.cases.Stay.make({
        checkIn: december(13),
      }),
    },
    {
      id: 'kanazawa-snow',
      text: 'Kanazawa can be wet and wintry; snow during your dates is possible, not guaranteed.',
      attachedTo: VerifyClaimAttachment.cases.Stay.make({
        checkIn: december(13),
      }),
    },
  ],
  shigeharuVisit: { date: december(11), slot: 'morning' },
  birthdayOutline:
    'A slow breakfast, a short outing if you feel like it, an afternoon break, and a reserved sushi or seasonal seafood dinner.',
  pros: [
    'A substantial new destination alongside the Shigeharu opportunity.',
    'Four-night stays let you settle in, with room for poor weather or a lazy morning.',
    'An efficient rail loop with no domestic flights.',
    'Particularly strong for food, crafts, and traditional neighborhoods.',
  ],
  cons: [
    'Kanazawa can be wet and wintry; snow during your dates is possible, not guaranteed.',
    'No dedicated hot-spring retreat.',
    'Nikko is omitted; adding it would mean replacing another excursion or giving up downtime.',
  ],
  // The source gives no "choose this if" for Option 1, only "Why I recommend
  // it most".
  whyRecommended:
    'It makes the trip feel different from your previous visits while giving the knife shop appropriate attention. You get one new city in depth, a relaxed return to Kyoto, and Tokyo time at both ends.',
  travelNotes:
    'Tokyo–Kyoto is approximately 2¼ hours by fast shinkansen; Kyoto–Kanazawa roughly two hours with a change at Tsuruga; Kanazawa–Tokyo approximately 2½ hours. Each move comfortably fits into a half-day once hotel transfers are included.',
}
