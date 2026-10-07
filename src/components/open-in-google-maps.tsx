import { ExternalLinkIcon, MapPinIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Pin } from '@/trip/domain'
import { openInGoogleMapsUrlOf } from '@/trip/pins'

/** "Open in Google Maps" for a Pin: its own link, or else its coordinates. */
export function OpenInGoogleMaps({
  pin,
  className,
}: {
  pin: Pin
  className?: string
}) {
  return (
    <a
      href={openInGoogleMapsUrlOf(pin)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-3',
        className,
      )}
    >
      <MapPinIcon aria-hidden className="size-4 shrink-0" />
      Open in Google Maps
      <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
    </a>
  )
}
