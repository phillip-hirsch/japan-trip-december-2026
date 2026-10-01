import { use } from 'react'

import { RecommendationStar } from '@/components/itinerary-summary'
import { BaseMarker, lngLatOf, TripMapView } from '@/components/trip-map-view'
import { MapArc, MapRoute } from '@/components/ui/map'
import type { ComparisonMap, Coordinates } from '@/trip/domain'
import { getComparisonMap } from '@/trip/trip.functions'

// MapLibre takes colour strings, not CSS variables. The recommended Itinerary
// takes the theme's --vermilion; the others take hues that also differ in
// lightness, so they stay apart without full colour vision.
const recommendedColor = '#e85336'
const otherColors = ['#7cc1e9', '#e8be62', '#eee7d9', '#bba3e8', '#75cca7']

/** How far apart, in pixels, the Itineraries run where they share a path. */
const laneWidth = 3.5

let comparisonMap: Promise<ComparisonMap> | undefined

/** The map's data, fetched once, and again after a failure. */
const loadComparisonMap = () =>
  (comparisonMap ??= getComparisonMap().catch((error: unknown) => {
    comparisonMap = undefined
    throw error
  }))

/**
 * A path running west to east, so an Itinerary keeps to one side of a shared
 * path whichever way it rides it.
 */
const westToEast = (path: ReadonlyArray<Coordinates>) => {
  const [first, last] = [path[0], path.at(-1)]
  return first && last && first.longitude > last.longitude
    ? [...path].reverse()
    : path
}

/**
 * Each Itinerary's colour, vermilion when recommended, and its lane: an
 * offset that keeps it beside the others where they share a path.
 */
const drawn = (itineraries: ComparisonMap['itineraries']) => {
  let others = 0
  return itineraries.map((itinerary, index) => ({
    ...itinerary,
    color: itinerary.recommended
      ? recommendedColor
      : (otherColors[others++ % otherColors.length] ?? recommendedColor),
    offset: (index - (itineraries.length - 1) / 2) * laneWidth,
  }))
}

function Legend({
  itineraries,
}: {
  itineraries: ReadonlyArray<{
    optionNumber: number
    recommended: boolean
    color: string
  }>
}) {
  return (
    <ul
      aria-label="Itineraries on the map"
      className="absolute top-2 left-2 z-10 flex flex-col gap-1 rounded-md border bg-background px-2.5 py-2 text-xs shadow-sm"
    >
      {itineraries.map(({ optionNumber, recommended, color }) => (
        <li key={optionNumber} className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-[3px] w-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          Option {optionNumber}
          {recommended && <RecommendationStar className="size-3" />}
        </li>
      ))}
    </ul>
  )
}

/**
 * The map itself, loaded lazily with its data: every Base once as a point,
 * and each Itinerary's train Moves along their rail lines and flights as
 * arcs, in its own colour and lane, framed to fit them all. Day trips stay on
 * each Itinerary's own map.
 */
export default function ComparisonMapCanvas() {
  const { bases, itineraries, railAttribution } = use(loadComparisonMap())
  const lines = drawn(itineraries)
  return (
    <TripMapView
      points={[
        ...bases.map((place) => place.coordinates),
        ...itineraries.flatMap(({ trainMoves }) =>
          trainMoves.flatMap((move) => move.path),
        ),
      ]}
      railAttribution={railAttribution}
    >
      {lines.flatMap(({ optionNumber, trainMoves, color, offset }) =>
        trainMoves.map(({ date, path }) => (
          <MapRoute
            key={`${optionNumber} ${date}`}
            coordinates={westToEast(path).map(lngLatOf)}
            color={color}
            width={3}
            opacity={0.9}
            offset={offset}
            interactive={false}
          />
        )),
      )}
      {lines.map(
        ({ optionNumber, flights, color, offset }) =>
          flights.length > 0 && (
            <MapArc
              key={optionNumber}
              data={flights.map(({ date, from, to }) => ({
                id: date,
                from: lngLatOf(from.coordinates),
                to: lngLatOf(to.coordinates),
              }))}
              paint={{
                'line-color': color,
                'line-width': 2.5,
                'line-offset': offset,
              }}
              interactive={false}
            />
          ),
      )}
      {bases.map((place) => (
        <BaseMarker key={place.id} place={place} />
      ))}
      <Legend itineraries={lines} />
    </TripMapView>
  )
}
