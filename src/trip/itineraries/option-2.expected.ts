import type { ExpectedItinerary } from '@/trip/itineraries/expected'
import {
  shigeharuClaim,
  tokyoKyotoMinutes,
  tokyoToKyoto,
} from '@/trip/itineraries/expected'

export const expectedOption2: ExpectedItinerary = {
  optionNumber: 2,
  name: 'Kyoto + Hakone',
  recommended: false,
  bestFor: 'A relaxing birthday retreat',
  route: '東京 (Tokyo) → 京都 (Kyoto) → 箱根 (Hakone) → 東京 (Tokyo)',
  nightsPerBase: [
    ['Tokyo', 7],
    ['Kyoto', 4],
    ['Hakone', 3],
  ],
  newToYou: ['Kamakura', 'Uji', 'Hakone', 'Enoshima'],
  reasoning: {
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
    chooseThisIf:
      'your ideal birthday is a retreat, and that matters more than discovering another city.',
    travelNotes:
      'Hakone fits on the return toward Tokyo through Odawara. Allow approximately 3½–4½ hours hotel to hotel from Kyoto, depending on the train connection and ryokan location.',
  },
  stays: [
    {
      base: 'Tokyo',
      kanji: '東京',
      newPlace: false,
      dates: [6, 10],
      nights: 4,
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'Kyoto',
      kanji: '京都',
      newPlace: false,
      dates: [10, 14],
      nights: 4,
      accommodation: 'hotel',
      highlights: [],
    },
    {
      base: 'Hakone',
      kanji: '箱根',
      newPlace: true,
      dates: [14, 17],
      nights: 3,
      accommodation: 'ryokan',
      highlights: [],
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
    [8, 'Kamakura.'],
    [9, 'An easy Tokyo day.'],
    [10, 'Arrive Thursday.'],
    [11, 'Target Shigeharu Friday morning.'],
    [12, 'Leave the weekend lightly planned, with optional Uji.'],
    [13, 'Leave the weekend lightly planned, with optional Uji.'],
    [14, 'Arrive the day before your birthday.'],
    [
      15,
      'Breakfast, hot springs, a short walk, more relaxation, and dinner at the ryokan.',
    ],
    [
      16,
      'Your sightseeing day—perhaps the Open-Air Museum or a lake/ropeway outing, depending on conditions.',
    ],
    [17],
    [18],
    [19],
    [20],
  ],
  freeDays: [],
  moves: [
    { day: 10, ...tokyoToKyoto },
    {
      day: 14,
      mode: 'train',
      from: 'Kyoto',
      to: 'Hakone',
      sections: [['shinkansen', 'tokaido-shinkansen', 'Kyoto', 'Odawara']],
      minutes: [210, 270],
      changeStations: [],
    },
    // The source never says how long Hakone–Tokyo takes.
    {
      day: 17,
      mode: 'train',
      from: 'Hakone',
      to: 'Tokyo',
      sections: [],
      changeStations: [],
    },
  ],
  dayTrips: [
    { day: 8, place: 'Kamakura', optional: false, newPlace: true },
    { day: 12, place: 'Uji', optional: true, newPlace: true },
    { day: 13, place: 'Uji', optional: true, newPlace: true },
    { day: 18, place: 'Enoshima', optional: true, newPlace: true },
    { day: 19, place: 'Enoshima', optional: true, newPlace: true },
  ],
  verifyClaims: [shigeharuClaim],
  thursdayBackup: false,
  comparison: {
    birthdayBase: 'Hakone',
    moves: {
      count: 3,
      travelTime: [tokyoKyotoMinutes + 210, tokyoKyotoMinutes + 270],
      durationNotGiven: ['17 train Hakone → Tokyo'],
    },
    dayTrips: ['Kamakura', 'Uji (optional)', 'Enoshima (optional)'],
    flights: [],
    ryokanStays: ['Hakone, 14–17'],
  },
}
