import { Badge } from '@/components/ui/badge'

/** Marks a Day trip that's offered rather than planned. */
export function OptionalBadge() {
  return (
    <Badge
      variant="outline"
      className="border-dashed font-normal text-muted-foreground"
    >
      Optional
    </Badge>
  )
}
