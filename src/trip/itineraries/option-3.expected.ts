import type { ExpectedItinerary } from '@/trip/itineraries/expected'
import {
  shigeharuClaim,
  tokyoKyotoMinutes,
  tokyoToKyoto,
} from '@/trip/itineraries/expected'

export const expectedOption3: ExpectedItinerary = {
  optionNumber: 3,
  name: 'Tokyo + Kyoto',
  recommended: false,
  bestFor: 'Fewest moves and all three suggested day trips',
  route: '東京 (Tokyo) → 京都 (Kyoto) → 東京 (Tokyo)',
  nightsPerBase: [
    ['Tokyo', 10],
    ['Kyoto', 4],
  ],
  newToYou: ['Kamakura', 'Nikko', 'Enoshima'],
  reasoning: {
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
      base: 'Tokyo',
      kanji: '東京',
      newPlace: false,
      dates: [13, 20],
      nights: 7,
      accommodation: 'hotel',
      highlights: [],
    },
  ],
  days: [
    [6, 'Arrival.'],
    [7, 'Jet-lag recovery.'],
    [8, 'Relaxed neighborhood time.'],
    [9],
    [10, 'Thursday flexibility.'],
    [11, 'Friday morning for Shigeharu.'],
    [12, 'An easy Saturday.'],
    [13],
    [14, 'Kamakura.'],
    [15, 'Birthday in Tokyo.'],
    [16, 'Nikko.'],
    // "Unscheduled Tokyo day": deliberately left unplanned.
    [17],
    [18, 'Enoshima afternoon and evening.'],
    [19, 'Shopping, favorite food, and packing.'],
    [20],
  ],
  freeDays: [17],
  moves: [
    { day: 9, ...tokyoToKyoto },
    {
      day: 13,
      mode: 'train',
      from: 'Kyoto',
      to: 'Tokyo',
      sections: [['shinkansen', 'tokaido-shinkansen', 'Kyoto', 'Tokyo']],
      minutes: [tokyoKyotoMinutes, tokyoKyotoMinutes],
      changeStations: [],
    },
  ],
  dayTrips: [
    { day: 14, place: 'Kamakura', optional: false, newPlace: true },
    { day: 16, place: 'Nikko', optional: false, newPlace: true },
    { day: 18, place: 'Enoshima', optional: false, newPlace: true },
  ],
  verifyClaims: [
    shigeharuClaim,
    [
      'Day 16',
      'nikko-toshogu-winter-hours',
      'Toshogu closes at 16:00 in winter.',
    ],
    [
      'Day 18',
      'enoshima-winter-illumination',
      'Enoshima’s announced winter illumination dates cover your trip, making it a good afternoon-and-evening excursion.',
    ],
  ],
  thursdayBackup: true,
  comparison: {
    birthdayBase: 'Tokyo',
    moves: {
      count: 2,
      travelTime: [tokyoKyotoMinutes * 2, tokyoKyotoMinutes * 2],
      durationNotGiven: [],
    },
    dayTrips: ['Kamakura', 'Nikko', 'Enoshima'],
    flights: [],
    ryokanStays: [],
  },
}
