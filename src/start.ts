import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { serverFnFetch } from '@/access/server-fn-fetch'

export const startInstance = createStart(() => ({
  // A start instance replaces TanStack's default request middleware, so keep
  // its CSRF check on server functions explicitly.
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
  ],
  // Browser calls only; during SSR, server functions run directly.
  serverFns: { fetch: serverFnFetch },
}))
