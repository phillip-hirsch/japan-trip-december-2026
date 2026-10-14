import { Badge } from '@/components/ui/badge'

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
