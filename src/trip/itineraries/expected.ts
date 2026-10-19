import type {
  AccommodationKind,
  ItineraryReasoning,
  MoveMode,
  RailSectionMode,
} from '@/trip/domain/domain'

/** What an Itinerary should say, written from its markdown source. */
export interface ExpectedItinerary {
  readonly optionNumber: number
  readonly name: string
  readonly recommended: boolean
  readonly bestFor: string
  readonly route: string
  readonly nightsPerBase: ReadonlyArray<readonly [base: string, nights: number]>
  readonly newToYou: ReadonlyArray<string>
  readonly reasoning: ItineraryReasoning
  readonly stays: ReadonlyArray<{
    readonly base: string
    readonly kanji: string
    readonly newPlace: boolean
    readonly dates: readonly [number, number]
    readonly nights: number
    readonly accommodation: AccommodationKind
    readonly highlights: ReadonlyArray<string>
  }>
  readonly days: ReadonlyArray<readonly [day: number, description?: string]>
  readonly freeDays: ReadonlyArray<number>
  readonly moves: ReadonlyArray<{
    readonly day: number
    readonly mode: MoveMode
    readonly from: string
    readonly to: string
    readonly sections: ReadonlyArray<
      readonly [mode: RailSectionMode, line: string, from: string, to: string]
    >
    readonly minutes?: readonly [min: number, max: number]
    readonly changeStations: ReadonlyArray<string>
  }>
  readonly dayTrips: ReadonlyArray<{
    readonly day: number
    readonly place: string
    readonly optional: boolean
    readonly newPlace: boolean
  }>
  readonly verifyClaims: ReadonlyArray<
    readonly [attachedTo: string, id: string, text: string]
  >
  readonly thursdayBackup: boolean
  readonly comparison: {
    readonly birthdayBase: string
    readonly moves: {
      readonly count: number
      readonly travelTime?: readonly [min: number, max: number]
      readonly durationNotGiven: ReadonlyArray<string>
    }
    readonly dayTrips: ReadonlyArray<string>
    readonly flights: ReadonlyArray<string>
    readonly ryokanStays: ReadonlyArray<string>
  }
}

export const shigeharuClaim = [
  'Day 11',
  'shigeharu-opening-days',
  'Recent visitor reports favor Friday mornings, with occasional Thursday openings, but this remains an observed pattern rather than a confirmed December schedule. Keep that morning flexible and have your agent or hotel confirm directly.',
] as const

export const tokyoKyotoMinutes = 135

export const tokyoToKyoto = {
  mode: 'train',
  from: 'Tokyo',
  to: 'Kyoto',
  sections: [['shinkansen', 'tokaido-shinkansen', 'Tokyo', 'Kyoto']],
  minutes: [tokyoKyotoMinutes, tokyoKyotoMinutes],
  changeStations: [],
} as const
