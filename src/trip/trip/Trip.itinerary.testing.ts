import { december, ItineraryContent } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'

export const option1With = (
  changes: Partial<ItineraryContent>,
): ItineraryContent => ({
  ...option1,
  ...changes,
})

export const withStays = (
  ...ranges: ReadonlyArray<
    readonly [base: ItineraryContent['stays'][number]['base'], number, number]
  >
): Pick<ItineraryContent, 'stays' | 'moves' | 'verifyClaims'> => ({
  stays: ranges.map(([base, checkIn, checkOut]) => ({
    base,
    checkIn: december(checkIn),
    checkOut: december(checkOut),
    accommodation: 'hotel',
    highlights: [],
  })),
  moves: ranges
    .slice(1)
    .flatMap(([, checkIn], index) =>
      ranges[index]?.[2] === checkIn
        ? [{ date: december(checkIn), mode: 'train', sections: [] }]
        : [],
    ),
  verifyClaims: [],
})
