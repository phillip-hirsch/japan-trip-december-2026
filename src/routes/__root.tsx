import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { AppSidebar, BottomTabBar } from '@/components/app-nav'
import { ConnectionBanner } from '@/components/connection-banner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import displayFont from '@/fonts/shippori-mincho-600-display.woff2?url'
import type { StyleWithVariables } from '@/lib/utils'
import appCss from '@/styles.css?url'

const ink = '#0b1015'

const inkStyle: StyleWithVariables = { '--ink': ink }

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        name: 'theme-color',
        content: ink,
      },
      {
        title: 'Japan · December 2026',
      },
    ],
    links: [
      {
        rel: 'preload',
        href: displayFont,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={inkStyle}>
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Base UI: portalled popups stack above an isolated app root. */}
        <div className="isolate">
          <Toaster>
            <TooltipProvider>
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="min-w-0 pb-(--tab-bar-height) md:pb-0">
                  {children}
                </SidebarInset>
                <BottomTabBar />
              </SidebarProvider>
            </TooltipProvider>
          </Toaster>
          <ConnectionBanner />
        </div>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
