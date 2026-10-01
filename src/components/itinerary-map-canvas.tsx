import type { LngLatBoundsLike } from 'maplibre-gl'

import { PlaceName } from '@/components/place-name'
import {
  Map as MapView,
  MapArc,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  MarkerPopup,
} from '@/components/ui/map'
import type { Coordinates, ItineraryMap, Place } from '@/trip/domain'

// MapLibre takes colour strings, not CSS variables: these are the theme's
// --paper, --chart-1 and --muted-foreground in hex. Vermilion stays reserved
// for the recommended Itinerary and the Birthday.
const trainColor = '#eee7d9'
const flightColor = '#a1c3db'
const dayTripColor = '#aba397'

const lngLatOf = ({ longitude, latitude }: Coordinates): [number, number] => [
  longitude,
  latitude,
]

/** The smallest box around every point, as [south-west, north-east]. */
const boundsOf = (points: ReadonlyArray<Coordinates>): LngLatBoundsLike => {
  const longitudes = points.map((point) => point.longitude)
  const latitudes = points.map((point) => point.latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

/** A Base: a point with its name always shown. */
function BaseMarker({ place }: { place: Place }) {
  const { latitude, longitude } = place.coordinates
  return (
    <MapMarker latitude={latitude} longitude={longitude}>
      <MarkerContent className="cursor-default">
        <span className="block size-3 rounded-full bg-foreground ring-2 ring-background" />
        <MarkerLabel className="text-xs [text-shadow:0_0_3px_var(--background),0_0_6px_var(--background)]">
          <PlaceName place={place} />
        </MarkerLabel>
      </MarkerContent>
    </MapMarker>
  )
}

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

/**
 * The map itself, loaded lazily: Bases as points, train Moves as solid
 * lines, flights as arcs and Day trips as dashed lines, framed to fit them
 * all. Gestures are cooperative so the page still scrolls past the map.
 */
export default function ItineraryMapCanvas({ map }: { map: ItineraryMap }) {
  const baseIds = new Set(map.bases.map((base) => base.id))
  const destinations = Array.from(
    new Map(map.dayTrips.map(({ to }) => [to.id, to])).values(),
  ).filter((place) => !baseIds.has(place.id))
  const bounds = boundsOf([
    ...[...map.bases, ...destinations].map((place) => place.coordinates),
    ...map.trainMoves.flatMap((move) => move.path),
  ])
  return (
    <MapView
      bounds={bounds}
      fitBoundsOptions={{ padding: 48 }}
      cooperativeGestures
      // Always shown in full, as the map data's licences require.
      attributionControl={{ compact: false }}
    >
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
      {destinations.map((place) => (
        <DestinationMarker key={place.id} place={place} />
      ))}
      {map.bases.map((place) => (
        <BaseMarker key={place.id} place={place} />
      ))}
      <MapControls />
    </MapView>
  )
}
