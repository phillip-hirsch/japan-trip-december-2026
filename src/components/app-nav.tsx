import { Link } from '@tanstack/react-router'
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
  { to: '/', label: 'Home', icon: HouseIcon, exact: true },
] as const satisfies ReadonlyArray<{
  to: LinkProps['to']
  label: string
  icon: LucideIcon
  exact: boolean
}>

/**
 * Link props that mark an entry's pages with data-active, which the sidebar's
 * owned styles already use. An exact entry matches only its own page; any
 * other also matches the pages below it, as an Itinerary page sits under
 * Options.
 */
const navLinkProps = ({ to, exact }: (typeof navEntries)[number]) => ({
  to,
  activeOptions: { exact },
  activeProps: { 'data-active': true },
})

/** Desktop navigation. */
export function AppSidebar() {
  return (
    // Not collapsible: it is the only desktop nav, so the Cmd/Ctrl+B shortcut
    // must not be able to hide it.
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh border-r border-sidebar-border md:flex"
    >
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
              {navEntries.map((entry) => (
                <SidebarMenuItem key={entry.to}>
                  <SidebarMenuButton render={<Link {...navLinkProps(entry)} />}>
                    <entry.icon />
                    <span>{entry.label}</span>
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
        {navEntries.map((entry) => (
          <li key={entry.to} className="flex-1">
            <Link
              {...navLinkProps(entry)}
              className="flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] text-muted-foreground transition-colors data-active:text-foreground"
            >
              <entry.icon className="size-5" aria-hidden />
              {entry.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
