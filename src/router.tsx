import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { NotFound } from '@/components/not-found'
import { PageError } from '@/components/page-error'
import { routeTree } from '@/routeTree.gen'
import { shouldDehydrateQuery } from '@/trip/client/queries'
import { createQueryClient } from '@/trip/client/query-client'

export function getRouter() {
  const queryClient = createQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFound,
    // Without it, a page whose loader fails, such as a page opened offline
    // from the SPA shell, replaces the whole document, frame and all.
    defaultErrorComponent: PageError,
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    dehydrateOptions: { shouldDehydrateQuery },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
