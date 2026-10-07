// Facts about Pins and Google Maps links that the Trip service and the
// browser share. See AGENTS.md: Effect in the browser.
import type { Coordinates, LocationLinkRefusal, Pin } from '@/trip/domain'
import { locationLinkMaxLength } from '@/trip/limits'

/** Whether a path is /maps or under it. */
const underMaps = (pathname: string) =>
  pathname === '/maps' || pathname.startsWith('/maps/')

/**
 * A link as a URL when it is an https link on a Google Maps host:
 * google.com/maps, maps.google.com, maps.app.goo.gl or goo.gl/maps. Anything
 * else, such as another scheme, host or port, a link with credentials or no
 * link at all, is undefined. It reads a relative link, such as a
 * redirect's, against its base.
 */
export const googleMapsUrlOf = (link: string, base?: URL): URL | undefined => {
  let url: URL

  try {
    url = new URL(link, base)
  } catch {
    return undefined
  }

  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return undefined
  }

  const { hostname, pathname } = url

  const allowed =
    hostname === 'maps.google.com' ||
    hostname === 'maps.app.goo.gl' ||
    ((hostname === 'google.com' || hostname === 'www.google.com') &&
      underMaps(pathname)) ||
    (hostname === 'goo.gl' && underMaps(pathname))

  return allowed ? url : undefined
}

/**
 * Why a Pin can't keep a link: it's longer than 2,000 characters, or isn't
 * an https Google Maps link. Undefined when it can.
 */
export const linkRefusalOf = (
  link: string,
): Extract<LocationLinkRefusal, 'TooLong' | 'NotGoogleMaps'> | undefined => {
  if (link.length > locationLinkMaxLength) return 'TooLong'

  return googleMapsUrlOf(link) === undefined ? 'NotGoogleMaps' : undefined
}

/** Whether a Google Maps URL is a short link, which redirects to the place. */
export const isShortLink = ({ hostname }: URL) =>
  hostname === 'maps.app.goo.gl' || hostname === 'goo.gl'

const number = String.raw`(-?\d+(?:\.\d+)?)`

// The place's own pin, as !3d<lat>!4d<lng> in the data of the path. A link
// can carry several, such as a street address before the place, and the last
// is the place's.
const pinMarker = new RegExp(String.raw`!3d${number}!4d${number}`, 'g')

// The centre of the map shown, as /@<lat>,<lng>,<zoom> in the path.
const viewport = new RegExp(String.raw`/@${number},${number}`)

// Coordinates searched for, as q=<lat>,<lng>, or as query=<lat>,<lng> the
// way an "Open in Google Maps" link carries them.
const coordinatesQuery = new RegExp(
  String.raw`^\s*${number}\s*,\s*${number}\s*$`,
)

const coordinatesOf = (match: RegExpMatchArray | null | undefined) => {
  const [, latitude, longitude] = match ?? []

  return latitude === undefined || longitude === undefined
    ? undefined
    : { latitude: Number(latitude), longitude: Number(longitude) }
}

/**
 * The coordinates a Google Maps URL carries, in order of preference: the
 * place's pin, the centre of the map shown, or coordinates searched for;
 * undefined when it carries none, such as a place named only.
 */
export const coordinatesInUrl = (url: URL): Coordinates | undefined =>
  coordinatesOf(Array.from(url.pathname.matchAll(pinMarker)).at(-1)) ??
  coordinatesOf(url.pathname.match(viewport)) ??
  coordinatesOf(
    (url.searchParams.get('q') ?? url.searchParams.get('query'))?.match(
      coordinatesQuery,
    ),
  )

/**
 * Whether coordinates are in Japan, taken as the box from Okinotorishima to
 * Wakkanai and from Yonaguni to Minamitorishima. The box takes in some of
 * its neighbours' coasts too, so it only catches a place clearly elsewhere.
 */
export const isInJapan = ({ latitude, longitude }: Coordinates) =>
  latitude >= 20 && latitude <= 46 && longitude >= 122 && longitude <= 154

/**
 * Where "Open in Google Maps" goes for a Pin: the link it was set from when
 * there is one, otherwise its coordinates.
 */
export const openInGoogleMapsUrlOf = ({ link, coordinates }: Pin) =>
  link ??
  `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`
