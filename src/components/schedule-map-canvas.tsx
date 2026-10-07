import { Link } from '@tanstack/react-router'
import { BedDoubleIcon, MapPinIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { HotelDetailsList } from '@/components/hotel-details'
import { ItineraryMapLayers, pointsOf } from '@/components/itinerary-map-layers'
import { OpenInGoogleMaps } from '@/components/open-in-google-maps'
import { stayElementId } from '@/components/stay-list'
import { FitToPoints, TripMapView } from '@/components/trip-map-view'
import { MapMarker, MarkerContent, MarkerPopup } from '@/components/ui/map'
import { cn } from '@/lib/utils'
import { formatDay, formatShortDate, timeOfDayOf } from '@/trip/calendar'
import type { MapActivity, MapHotel, Pin, ScheduleMap } from '@/trip/domain'

const popupLinkClassName =
  'text-sm font-medium text-foreground underline underline-offset-3'

/** A pinned hotel or Activity, as its marker names it and its popup shows it. */
interface PinnedPlace {
  readonly key: string
  readonly pin: Pin
  readonly label: string
  readonly icon: typeof BedDoubleIcon
  readonly details: ReactNode
}

/** A pinned hotel: its Hotel details and a link to its Stay. */
function HotelDetails({ hotel }: { hotel: MapHotel }) {
  const { stayId, base, checkIn, checkOut } = hotel

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Hotel in {base.romaji}, {formatShortDate(checkIn)} –{' '}
        {formatShortDate(checkOut)}
      </p>
      <HotelDetailsList details={hotel} />
      {/* HotelDetailsList offers "Open in Google Maps" with the Pin. */}
      <Link
        to="/schedule"
        hash={stayElementId(stayId)}
        className={popupLinkClassName}
      >
        See the Stay
      </Link>
    </>
  )
}

/** A pinned Activity: its title, Day and time, and a link to its Day. */
function ActivityDetails({ activity }: { activity: MapActivity }) {
  const { date, title, time, pin } = activity

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {formatDay(date)}
        {time !== undefined && (
          <>
            {' · '}
            <time dateTime={time}>{timeOfDayOf(time)}</time>
          </>
        )}
      </p>
      <p className="text-base font-medium break-words">{title}</p>
      <OpenInGoogleMaps pin={pin} />
      <Link
        to="/schedule/$date"
        params={{ date }}
        className={popupLinkClassName}
      >
        Open the Day
      </Link>
    </>
  )
}

/** Every pinned hotel, then every pinned Activity. */
const pinnedPlacesOf = ({ hotels, activities }: ScheduleMap) => [
  ...hotels.map((hotel): PinnedPlace => ({
    key: `hotel ${hotel.stayId}`,
    pin: hotel.pin,
    label: hotel.name ?? `Hotel in ${hotel.base.romaji}`,
    icon: BedDoubleIcon,
    details: <HotelDetails hotel={hotel} />,
  })),
  ...activities.map((activity): PinnedPlace => ({
    key: `activity ${activity.id}`,
    pin: activity.pin,
    label: activity.title,
    icon: MapPinIcon,
    details: <ActivityDetails activity={activity} />,
  })),
]

/**
 * The pinned places grouped by their exact spot, such as a hotel and the
 * breakfast there, so one marker shows them all rather than one hiding
 * another.
 */
const bySpot = (places: ReadonlyArray<PinnedPlace>) => {
  const spots = new Map<string, Array<PinnedPlace>>()

  for (const place of places) {
    const { latitude, longitude } = place.pin.coordinates
    const spot = `${latitude},${longitude}`
    spots.set(spot, [...(spots.get(spot) ?? []), place])
  }

  return Array.from(spots)
}

/**
 * One spot's pinned places: a marker showing the first one's icon, and how
 * many there are when more than one, opening a popup with each in turn.
 */
function SpotMarker({ places }: { places: ReadonlyArray<PinnedPlace> }) {
  const [first] = places

  if (first === undefined) return null
  const { latitude, longitude } = first.pin.coordinates

  return (
    <MapMarker latitude={latitude} longitude={longitude} anchor="bottom">
      <MarkerContent>
        <span
          role="img"
          aria-label={places.map((place) => place.label).join('; ')}
          className="relative flex size-7 items-center justify-center rounded-full border-2 border-background bg-foreground text-background shadow-md"
        >
          <first.icon aria-hidden className="size-3.5" />
          {places.length > 1 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-background bg-muted-foreground text-[0.625rem] font-semibold text-background tabular-nums"
            >
              {places.length}
            </span>
          )}
        </span>
      </MarkerContent>
      <MarkerPopup
        offset={20}
        className="flex max-h-[min(28rem,60svh)] flex-col gap-3 overflow-y-auto text-sm"
      >
        {places.map((place, index) => (
          <section
            key={place.key}
            className={cn('flex flex-col gap-2', index > 0 && 'border-t pt-3')}
          >
            {place.details}
          </section>
        ))}
      </MarkerPopup>
    </MapMarker>
  )
}

/**
 * The map itself, loaded lazily: the Schedule's Bases, Moves and Day trips,
 * and its pinned hotels and Activities, framed to fit them all, and framed
 * again when an edit reaches further. It fills the page, so gestures move
 * the map directly.
 */
export default function ScheduleMapCanvas({ map }: { map: ScheduleMap }) {
  const points = [
    ...pointsOf(map),
    ...[...map.hotels, ...map.activities].map(({ pin }) => pin.coordinates),
  ]

  return (
    <TripMapView
      points={points}
      railAttribution={map.railAttribution}
      fullScreen
    >
      <FitToPoints points={points} />
      <ItineraryMapLayers map={map} />
      {bySpot(pinnedPlacesOf(map)).map(([spot, places]) => (
        <SpotMarker key={spot} places={places} />
      ))}
    </TripMapView>
  )
}
