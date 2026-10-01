import { DisplayJa } from '@/components/display-ja'
import { NewPlaceBadge } from '@/components/new-place-badge'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { VerifyClaims } from '@/components/verify-claims'
import { formatNights, formatShortDate } from '@/trip/calendar'
import type { AccommodationKind, StayDetail } from '@/trip/domain'

const accommodationLabels: Record<AccommodationKind, string> = {
  hotel: 'Hotel',
  ryokan: 'Ryokan',
}

/**
 * An Itinerary's Stays: each Base with its dates, nights, accommodation kind,
 * highlights and Verify claims.
 */
export function StayList({ stays }: { stays: ReadonlyArray<StayDetail> }) {
  return (
    <ol className="flex flex-col gap-2">
      {stays.map((stay) => (
        <li key={stay.checkIn}>
          <Item variant="outline">
            <ItemMedia className="w-14 justify-start">
              <DisplayJa text={stay.base.kanji} className="text-2xl" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {stay.base.romaji}
                <NewPlaceBadge place={stay.base} />
              </ItemTitle>
              <ItemDescription>
                <time dateTime={stay.checkIn}>
                  {formatShortDate(stay.checkIn)}
                </time>
                {' – '}
                <time dateTime={stay.checkOut}>
                  {formatShortDate(stay.checkOut)}
                </time>
                {' · '}
                {accommodationLabels[stay.accommodation]}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="text-sm text-muted-foreground tabular-nums">
              {formatNights(stay.nights)}
            </ItemActions>
            {(stay.highlights.length > 0 || stay.verifyClaims.length > 0) && (
              <ItemFooter className="flex-col items-stretch gap-2 sm:pl-[4.375rem]">
                {stay.highlights.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Highlights: </span>
                    {stay.highlights.join(', ')}
                  </p>
                )}
                <VerifyClaims claims={stay.verifyClaims} />
              </ItemFooter>
            )}
          </Item>
        </li>
      ))}
    </ol>
  )
}
