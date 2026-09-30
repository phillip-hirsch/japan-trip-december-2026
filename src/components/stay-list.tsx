import { DisplayJa } from '@/components/display-ja'
import { Badge } from '@/components/ui/badge'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { formatNights, formatShortDate } from '@/trip/calendar'
import type { StayDetail } from '@/trip/domain'

/** An Itinerary's Stays: each Base with its dates and nights. */
export function StayList({ stays }: { stays: ReadonlyArray<StayDetail> }) {
  return (
    <ol className="flex flex-col gap-2">
      {stays.map(({ base, checkIn, checkOut, nights }) => (
        <li key={checkIn}>
          <Item variant="outline">
            <ItemMedia className="w-14 justify-start">
              <DisplayJa text={base.kanji} className="text-2xl" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {base.romaji}
                {base.newPlace && (
                  <Badge variant="outline" className="font-normal">
                    New place
                  </Badge>
                )}
              </ItemTitle>
              <ItemDescription>
                <time dateTime={checkIn}>{formatShortDate(checkIn)}</time>
                {' – '}
                <time dateTime={checkOut}>{formatShortDate(checkOut)}</time>
              </ItemDescription>
            </ItemContent>
            <ItemActions className="text-sm text-muted-foreground tabular-nums">
              {formatNights(nights)}
            </ItemActions>
          </Item>
        </li>
      ))}
    </ol>
  )
}
