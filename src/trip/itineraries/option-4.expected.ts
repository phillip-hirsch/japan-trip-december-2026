import type { ExpectedItinerary } from '@/trip/itineraries/expected'
import {
  shigeharuClaim,
  tokyoKyotoMinutes,
  tokyoToKyoto,
} from '@/trip/itineraries/expected'

export const expectedOption4: ExpectedItinerary = {
  optionNumber: 4,
  name: 'Kyoto + Fukuoka',
  recommended: false,
  bestFor: 'Exploring another region and eating exceptionally well',
  route: '東京 (Tokyo) → 京都 (Kyoto) → 福岡 (Fukuoka) → 東京 (Tokyo)',
  nightsPerBase: [
    ['Tokyo', 6],
    ['Kyoto', 4],
    ['Fukuoka', 4],
  ],
  newToYou: ['Kamakura', 'Fukuoka', 'Dazaifu', 'Enoshima'],
  reasoning: {
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
      base: 'Fukuoka',
      kanji: '福岡',
      newPlace: true,
      dates: [13, 17],
      nights: 4,
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
    [6, 'Arrival.'],
    [7, 'Recovery.'],
    [8, 'Optional Kamakura.'],
    [9],
    [10, 'Thursday flexibility.'],
    [11, 'Friday morning for Shigeharu.'],
    [12, 'A relaxed weekend.'],
    [13, 'A relaxed weekend.'],
    [14],
    [15, 'Birthday dinner.'],
    [16, 'Dazaifu, for the shrine and surrounding streets.'],
    [17, 'Fly back.'],
    [18, 'Leave room for Enoshima.'],
    // "A free final day": deliberately left unplanned.
    [19],
    [20],
  ],
  freeDays: [14, 19],
  moves: [
    { day: 9, ...tokyoToKyoto },
    {
      day: 13,
      mode: 'train',
      from: 'Kyoto',
      to: 'Fukuoka',
      sections: [['shinkansen', 'tokaido-sanyo-shinkansen', 'Kyoto', 'Hakata']],
      minutes: [165, 165],
      changeStations: [],
    },
    // The source never says how long the flight takes.
    {
      day: 17,
      mode: 'flight',
      from: 'Fukuoka',
      to: 'Tokyo',
      sections: [],
      changeStations: [],
    },
  ],
  dayTrips: [
    { day: 8, place: 'Kamakura', optional: true, newPlace: true },
    { day: 16, place: 'Dazaifu', optional: true, newPlace: true },
    { day: 18, place: 'Enoshima', optional: true, newPlace: true },
  ],
  verifyClaims: [shigeharuClaim],
  thursdayBackup: true,
  comparison: {
    birthdayBase: 'Fukuoka',
    moves: {
      count: 3,
      travelTime: [tokyoKyotoMinutes + 165, tokyoKyotoMinutes + 165],
      durationNotGiven: ['17 flight Fukuoka → Tokyo'],
    },
    dayTrips: [
      'Kamakura (optional)',
      'Dazaifu (optional)',
      'Enoshima (optional)',
    ],
    flights: ['17 Fukuoka → Tokyo'],
    ryokanStays: [],
  },
}
