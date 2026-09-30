import { Link, useMatchRoute } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { HouseIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { DisplayJa } from '@/components/display-ja'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

/**
 * The destinations shared by the bottom tab bar and the sidebar. Add an entry
 * only once its page exists.
 */
const navEntries = [
  { to: '/', label: 'Home', icon: HouseIcon },
] as const satisfies ReadonlyArray<{
  to: LinkProps['to']
  label: string
  icon: LucideIcon
}>

/** Desktop navigation. */
export function AppSidebar() {
  const matchRoute = useMatchRoute()
  return (
    <Sidebar>
      <SidebarHeader className="px-4 pt-6 pb-4">
        <Link to="/" className="flex items-baseline gap-2">
          <DisplayJa text="日本" className="text-xl" />
          <span className="font-heading text-sm tracking-[0.2em] text-muted-foreground">
            2026
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navEntries.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    isActive={Boolean(matchRoute({ to }))}
                    render={<Link to={to} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

/** Mobile navigation, within reach of the thumb. */
export function BottomTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex">
        {navEntries.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: true }}
              className="flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] text-muted-foreground transition-colors data-[status=active]:text-foreground"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
