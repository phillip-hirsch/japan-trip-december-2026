import { Link } from '@tanstack/react-router'
import { BedDoubleIcon, MapPinIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { HotelDetailsList } from '@/components/hotel-details'
import { ItineraryMapLayers, pointsOf } from '@/components/itinerary-map-layers'
import { OpenInGoogleMaps } from '@/components/open-in-google-maps'
import { stayElementId } from '@/components/stay-list'
import { FitToPoints, TripMapView } from '@/components/trip-map-view'
import { MapMarker, MarkerContent, MarkerPopup } from '@/components/ui/map'
import { formatDay, formatShortDate, timeOfDayOf } from '@/trip/calendar'
import type { MapActivity, MapHotel, Pin, ScheduleMap } from '@/trip/domain'

const popupLinkClassName =
  'text-sm font-medium text-foreground underline underline-offset-3'

/** A pinned place, showing what it is when tapped. */
function PinMarker({
  pin,
  label,
  icon,
  children,
}: {
  pin: Pin
  label: string
  icon: ReactNode
  /** What a tap shows. */
  children: ReactNode
}) {
  const { latitude, longitude } = pin.coordinates

  return (
    <MapMarker latitude={latitude} longitude={longitude} anchor="bottom">
      <MarkerContent>
        <span
          role="img"
          aria-label={label}
          className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-foreground text-background shadow-md"
        >
          {icon}
        </span>
      </MarkerContent>
      <MarkerPopup offset={20} className="flex flex-col gap-2 text-sm">
        {children}
      </MarkerPopup>
    </MapMarker>
  )
}

/** A pinned hotel: its Hotel details and a link to its Stay. */
function HotelPin({ hotel }: { hotel: MapHotel }) {
  const { stayId, base, checkIn, checkOut, pin } = hotel

  return (
    <PinMarker
      pin={pin}
      label={hotel.name ?? `Hotel in ${base.romaji}`}
      icon={<BedDoubleIcon aria-hidden className="size-3.5" />}
    >
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
    </PinMarker>
  )
}

/** A pinned Activity: its title, Day and time, and a link to its Day. */
function ActivityPin({ activity }: { activity: MapActivity }) {
  const { date, title, time, pin } = activity

  return (
    <PinMarker
      pin={pin}
      label={title}
      icon={<MapPinIcon aria-hidden className="size-3.5" />}
    >
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
    </PinMarker>
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
      {map.hotels.map((hotel) => (
        <HotelPin key={hotel.stayId} hotel={hotel} />
      ))}
      {map.activities.map((activity) => (
        <ActivityPin key={activity.id} activity={activity} />
      ))}
    </TripMapView>
  )
}
