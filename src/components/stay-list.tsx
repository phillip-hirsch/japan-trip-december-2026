import type { ReactNode } from 'react'

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
 * An Itinerary's or Schedule's Stays: each Base with its dates, nights,
 * accommodation kind, highlights and Verify claims, and whatever else the
 * Schedule adds to each, such as its Stay note. A Schedule's Stay is keyed by
 * its id, which it keeps when its dates change, so its open editors stay
 * open.
 */
export function StayList<S extends StayDetail & { readonly id?: string }>({
  stays,
  footer,
}: {
  stays: ReadonlyArray<S>
  /** More to show at the foot of a Stay, if anything. */
  footer?: (stay: S) => ReactNode
}) {
  return (
    <ol className="flex flex-col gap-2">
      {stays.map((stay) => {
        const extra = footer?.(stay)

        return (
          <li key={stay.id ?? stay.checkIn}>
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
              {(stay.highlights.length > 0 ||
                stay.verifyClaims.length > 0 ||
                extra) && (
                <ItemFooter className="flex-col items-stretch gap-2 sm:pl-[4.375rem]">
                  {stay.highlights.length > 0 && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        Highlights:{' '}
                      </span>
                      {stay.highlights.join(', ')}
                    </p>
                  )}
                  <VerifyClaims claims={stay.verifyClaims} />
                  {extra}
                </ItemFooter>
              )}
            </Item>
          </li>
        )
      })}
    </ol>
  )
}
