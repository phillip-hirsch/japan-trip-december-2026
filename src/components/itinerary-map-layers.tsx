import { PlaceName } from '@/components/place-name'
import { BaseMarker, lngLatOf } from '@/components/trip-map-view'
import {
  MapArc,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerPopup,
} from '@/components/ui/map'
import type { Coordinates, ItineraryMap, Place } from '@/trip/domain'

// MapLibre takes colour strings, not CSS variables: these are the theme's
// --paper, --chart-1 and --muted-foreground in hex. Vermilion stays reserved
// for the recommended Itinerary and the Birthday.
const trainColor = '#eee7d9'

const flightColor = '#a1c3db'

const dayTripColor = '#aba397'

/**
 * A Day trip destination: a smaller point named when tapped, since nearby
 * destinations such as Kamakura and Enoshima would overlap as labels.
 */
function DestinationMarker({ place }: { place: Place }) {
  const { latitude, longitude } = place.coordinates

  return (
    <MapMarker latitude={latitude} longitude={longitude}>
      <MarkerContent>
        <span
          role="img"
          aria-label={place.romaji}
          className="block size-2.5 rounded-full bg-muted-foreground ring-2 ring-background"
        />
      </MarkerContent>
      <MarkerPopup offset={12} className="px-2.5 py-1.5 text-xs">
        <PlaceName place={place} />
      </MarkerPopup>
    </MapMarker>
  )
}

/** The Day trip destinations that aren't also Bases, each once. */
const destinationsOf = ({ bases, dayTrips }: ItineraryMap) => {
  const baseIds = new Set(bases.map((base) => base.id))

  return Array.from(
    new Map(dayTrips.map(({ to }) => [to.id, to])).values(),
  ).filter((place) => !baseIds.has(place.id))
}

/** Every point the map draws, to frame it. */
export const pointsOf = (map: ItineraryMap): Array<Coordinates> => [
  ...[...map.bases, ...destinationsOf(map)].map((place) => place.coordinates),
  ...map.trainMoves.flatMap((move) => move.path),
]

/**
 * An Itinerary or Schedule drawn on a map: Bases as points, train Moves as
 * solid lines along their rail lines, flights as arcs and Day trips as dashed
 * lines.
 */
export function ItineraryMapLayers({ map }: { map: ItineraryMap }) {
  return (
    <>
      {map.dayTrips.map(({ from, to, optional }) => (
        <MapRoute
          key={`${from.id} ${to.id}`}
          coordinates={[lngLatOf(from.coordinates), lngLatOf(to.coordinates)]}
          color={dayTripColor}
          width={2}
          opacity={optional ? 0.6 : 0.9}
          dashArray={[2, 2]}
          interactive={false}
        />
      ))}
      {map.trainMoves.map(({ date, path }) => (
        <MapRoute
          key={date}
          coordinates={path.map(lngLatOf)}
          color={trainColor}
          width={3}
          opacity={0.9}
          interactive={false}
        />
      ))}
      <MapArc
        data={map.flights.map(({ date, from, to }) => ({
          id: date,
          from: lngLatOf(from.coordinates),
          to: lngLatOf(to.coordinates),
        }))}
        paint={{ 'line-color': flightColor, 'line-width': 2.5 }}
        interactive={false}
      />
      {destinationsOf(map).map((place) => (
        <DestinationMarker key={place.id} place={place} />
      ))}
      {map.bases.map((place) => (
        <BaseMarker key={place.id} place={place} />
      ))}
    </>
  )
}
