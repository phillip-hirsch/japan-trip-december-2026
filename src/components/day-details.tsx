import { Predicate } from 'effect'
import {
  ArrowRightIcon,
  BuildingIcon,
  LuggageIcon,
  MapPinnedIcon,
  PlaneIcon,
  TrainFrontIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { NewPlaceBadge } from '@/components/new-place-badge'
import { OptionalBadge } from '@/components/optional-badge'
import { PlaceName } from '@/components/place-name'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDurationRange } from '@/trip/calendar'
import type { Anchor, DayTripDetail, MoveDetail, MoveMode } from '@/trip/domain'

// The pieces of a Day, shared by the Day timeline and a Day's own page.

const anchorBadges: Record<
  Anchor['_tag'],
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  Arrival: { label: 'Arrival', variant: 'secondary' },
  ShigeharuVisit: { label: 'Shigeharu', variant: 'outline' },
  Birthday: { label: 'Birthday', variant: 'default' },
  Departure: { label: 'Departure', variant: 'secondary' },
}

export const isBirthday = (anchors: ReadonlyArray<Anchor>) =>
  anchors.some((anchor) => Predicate.isTagged('Birthday')(anchor))

/** A Day's Anchors as badges, and Free day when it is one; nothing otherwise. */
export function AnchorBadges({
  anchors,
  freeDay,
  className,
}: {
  anchors: ReadonlyArray<Anchor>
  freeDay: boolean
  className?: string
}) {
  if (anchors.length === 0 && !freeDay) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {anchors.map((anchor) => {
        const badge = anchorBadges[anchor._tag]

        return (
          <Badge
            key={anchor._tag}
            variant={badge.variant}
            className={cn(
              Predicate.isTagged('ShigeharuVisit')(anchor) && 'border-dashed',
            )}
          >
            {badge.label}
          </Badge>
        )
      })}
      {freeDay && (
        <Badge
          variant="outline"
          className="border-dashed text-muted-foreground"
        >
          Free day
        </Badge>
      )}
    </div>
  )
}

/** What an Anchor adds in words: only the Shigeharu visit has a note. */
export function AnchorNotes({ anchors }: { anchors: ReadonlyArray<Anchor> }) {
  return anchors.map((anchor) =>
    Predicate.isTagged('ShigeharuVisit')(anchor) ? (
      <p key={anchor._tag} className="text-xs text-muted-foreground">
        Tentative, in the {anchor.slot}
        {anchor.thursdayBackup && ', with Thursday morning as a backup'}.
      </p>
    ) : null,
  )
}

const moveModes: Record<MoveMode, { label: string; icon: LucideIcon }> = {
  train: { label: 'Train', icon: TrainFrontIcon },
  flight: { label: 'Flight', icon: PlaneIcon },
  local: { label: 'Local', icon: BuildingIcon },
}

/** A Move's two Bases, with luggage. */
export function MoveRoute({
  move,
  className,
}: {
  move: MoveDetail
  className?: string
}) {
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5 text-sm', className)}>
      <LuggageIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">Move</span>
      <PlaceName place={move.from} />
      <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="sr-only">to</span>
      <PlaceName place={move.to} />
    </p>
  )
}

/** How a Move travels: its mode, rough duration and any change of train. */
export function MoveTravel({
  move,
  onSchedule = false,
  className,
}: {
  move: MoveDetail
  /**
   * Whether the Move is on the Schedule. A train or flight Move without a
   * duration then has its travel time unknown, as after a Base change. In an
   * Itinerary, its source didn't give one.
   */
  onSchedule?: boolean
  className?: string
}) {
  const { label, icon: Icon } = moveModes[move.mode]

  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="text-foreground">{label}</span>
      {/* A local Move stays within one Base, unless a Base change has
          made it join two. */}
      {(move.mode !== 'local' || move.from.id !== move.to.id) && (
        <span>
          ·{' '}
          {move.duration
            ? formatDurationRange(move.duration)
            : onSchedule
              ? 'travel time unknown'
              : 'duration not given'}
        </span>
      )}
      {move.changes.map((station) => (
        <span key={station.id}>· change at {station.name}</span>
      ))}
    </p>
  )
}

/** A Day trip's destination, with whether it's New and whether it's optional. */
export function DayTripLine({
  dayTrip: { place, optional },
  className,
}: {
  dayTrip: DayTripDetail
  className?: string
}) {
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5 text-sm', className)}>
      <MapPinnedIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">Day trip</span>
      <PlaceName place={place} />
      <NewPlaceBadge place={place} />
      {optional && <OptionalBadge />}
    </p>
  )
}
