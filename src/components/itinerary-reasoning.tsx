import { MinusIcon, PlusIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { ItineraryReasoning as Reasoning } from '@/trip/domain'

function Part({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className={cn(
          'text-xs tracking-[0.2em] text-muted-foreground uppercase',
          className,
        )}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}

function Points({
  points,
  icon: Icon,
}: {
  points: ReadonlyArray<string>
  icon: LucideIcon
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {points.map((point) => (
        <li key={point} className="flex items-start gap-2">
          <Icon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          {point}
        </li>
      ))}
    </ul>
  )
}

/**
 * gpt-6-astra's reasoning about an Itinerary, showing only the parts the
 * source gives.
 */
export function ItineraryReasoning({ reasoning }: { reasoning: Reasoning }) {
  return (
    <div className="flex flex-col gap-6 text-sm leading-relaxed">
      {reasoning.whyRecommended !== undefined && (
        <Part title="Why it’s recommended" className="text-primary">
          <p>{reasoning.whyRecommended}</p>
        </Part>
      )}
      {reasoning.chooseThisIf !== undefined && (
        <Part title="Choose this if">
          <p>{reasoning.chooseThisIf}</p>
        </Part>
      )}
      {reasoning.pros.length > 0 && (
        <Part title="Pros">
          <Points points={reasoning.pros} icon={PlusIcon} />
        </Part>
      )}
      {reasoning.cons.length > 0 && (
        <Part title="Cons">
          <Points points={reasoning.cons} icon={MinusIcon} />
        </Part>
      )}
      <Part title="Birthday" className="text-primary">
        <p>{reasoning.birthdayOutline}</p>
      </Part>
      {reasoning.travelNotes !== undefined && (
        <Part title="Travel">
          <p>{reasoning.travelNotes}</p>
        </Part>
      )}
    </div>
  )
}
