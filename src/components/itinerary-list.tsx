import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import type { ItinerarySummary } from '@/trip/domain'

/** Every Itinerary as "Option N" with its name, linking to its page. */
export function ItineraryList({
  itineraries,
}: {
  itineraries: ReadonlyArray<ItinerarySummary>
}) {
  return (
    <ul className="flex flex-col gap-2">
      {itineraries.map(({ optionNumber, name }) => (
        <li key={optionNumber}>
          <Item
            variant="outline"
            render={
              <Link to="/options/$optionNumber" params={{ optionNumber }} />
            }
          >
            <ItemContent>
              <ItemTitle className="font-heading text-base">
                Option {optionNumber}
              </ItemTitle>
              <ItemDescription>{name}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="text-muted-foreground" aria-hidden />
            </ItemActions>
          </Item>
        </li>
      ))}
    </ul>
  )
}
