import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { NotFound } from '@/components/not-found'
import { routeTree } from '@/routeTree.gen'
import { shouldDehydrateQuery } from '@/trip/queries'
import { makeQueryClient } from '@/trip/query-client'

export function getRouter() {
  const queryClient = makeQueryClient()
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFound,
  })
  // Carries the queries a server render fetched into the browser's cache,
  // and provides the QueryClient to components.
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
