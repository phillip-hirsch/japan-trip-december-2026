import type { ExpectedItinerary } from '@/trip/itineraries/expected'
import {
  shigeharuClaim,
  tokyoKyotoMinutes,
  tokyoToKyoto,
} from '@/trip/itineraries/expected'

export const expectedOption1: ExpectedItinerary = {
  optionNumber: 1,
  name: 'Kyoto + Kanazawa',
  recommended: true,
  bestFor: 'Best overall balance of discovery, food, and Shigeharu',
  route: '東京 (Tokyo) → 京都 (Kyoto) → 金沢 (Kanazawa) → 東京 (Tokyo)',
  nightsPerBase: [
    ['Tokyo', 6],
    ['Kyoto', 4],
    ['Kanazawa', 4],
  ],
  newToYou: ['Kamakura', 'Uji', 'Kanazawa', 'Enoshima'],
  reasoning: {
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
    // The source gives Option 1 no "choose this if", only why it is
    // recommended.
    whyRecommended:
      'It makes the trip feel different from your previous visits while giving the knife shop appropriate attention. You get one new city in depth, a relaxed return to Kyoto, and Tokyo time at both ends.',
    travelNotes:
      'Tokyo–Kyoto is approximately 2¼ hours by fast shinkansen; Kyoto–Kanazawa roughly two hours with a change at Tsuruga; Kanazawa–Tokyo approximately 2½ hours. Each move comfortably fits into a half-day once hotel transfers are included.',
  },
  stays: [
    {
      base: 'Tokyo',
      kanji: '東京',
      newPlace: false,
      dates: [6, 9],
      nights: 3,
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'Kyoto',
      kanji: '京都',
      newPlace: false,
      dates: [9, 13],
      nights: 4,
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'Kanazawa',
      kanji: '金沢',
      newPlace: true,
      dates: [13, 17],
      nights: 4,
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
      base: 'Tokyo',
      kanji: '東京',
      newPlace: false,
      dates: [17, 20],
      nights: 3,
      accommodation: 'hotel',
      highlights: [],
    },
  ],
  days: [
    [6, 'Arrival evening.'],
    [7, 'A recovery day.'],
    [8, 'Kamakura.'],
    [9, 'Arrive Wednesday.'],
    [10, 'Keep Thursday flexible.'],
    [11, 'Friday morning for Shigeharu.'],
    [12, 'Uji or a leisurely Kyoto day.'],
    [13],
    [14],
    [15, 'Your birthday dinner.'],
    [16],
    [17],
    [18, 'Optional Enoshima afternoon/evening.'],
    [19, 'Shopping and relaxing.'],
    [20],
  ],
  freeDays: [14, 16],
  moves: [
    { day: 9, ...tokyoToKyoto },
    {
      day: 13,
      mode: 'train',
      from: 'Kyoto',
      to: 'Kanazawa',
      sections: [
        ['limited-express', 'thunderbird', 'Kyoto', 'Tsuruga'],
        ['shinkansen', 'hokuriku-shinkansen', 'Tsuruga', 'Kanazawa'],
      ],
      minutes: [120, 120],
      changeStations: ['Tsuruga'],
    },
    {
      day: 17,
      mode: 'train',
      from: 'Kanazawa',
      to: 'Tokyo',
      sections: [['shinkansen', 'hokuriku-shinkansen', 'Kanazawa', 'Tokyo']],
      minutes: [150, 150],
      changeStations: [],
    },
  ],
  dayTrips: [
    { day: 8, place: 'Kamakura', optional: false, newPlace: true },
    { day: 12, place: 'Uji', optional: true, newPlace: true },
    { day: 18, place: 'Enoshima', optional: true, newPlace: true },
  ],
  verifyClaims: [
    [
      'Stay 13',
      'kanazawa-crab-season',
      'December also falls within local crab season, which makes a special seafood dinner an appealing birthday plan.',
    ],
    [
      'Stay 13',
      'kanazawa-snow',
      'Kanazawa can be wet and wintry; snow during your dates is possible, not guaranteed.',
    ],
    shigeharuClaim,
  ],
  thursdayBackup: true,
  comparison: {
    birthdayBase: 'Kanazawa',
    moves: {
      count: 3,
      travelTime: [
        tokyoKyotoMinutes + 120 + 150,
        tokyoKyotoMinutes + 120 + 150,
      ],
      durationNotGiven: [],
    },
    dayTrips: ['Kamakura', 'Uji (optional)', 'Enoshima (optional)'],
    flights: [],
    ryokanStays: [],
  },
}
