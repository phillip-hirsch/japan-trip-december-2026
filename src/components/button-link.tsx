import { createLink } from '@tanstack/react-router'
import type { VariantProps } from 'class-variance-authority'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function ButtonAnchor({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'a'> & VariantProps<typeof buttonVariants>) {
  return (
    <a
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/**
 * A type-safe router Link that looks like a Button. Use it for navigation;
 * Base UI's Button renders a <button>, so it can't carry an href itself.
 */
export const ButtonLink = createLink(ButtonAnchor)
