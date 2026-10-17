import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { schedulesQuery } from '@/trip/queries'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

export const deferred = <A>() => {
  let resolve: (value: A) => void = () => undefined

  const promise = new Promise<A>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}

/**
 * A page showing the Schedules, read with `read`, and an editor on it whose
 * field is `useField(props)`. Opening it again after closing it is a reload:
 * Drafts kept on the device are all that carries over. The router is only
 * there for the server functions, which hand it any redirect.
 */
export const openEditor = async <P extends object, F>(
  useField: (props: P) => F,
  props: P,
  read: () => Promise<string> = async () => 'schedules',
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  })

  let rendered: F | undefined

  const Page = (pageProps: P) => {
    useQuery({ queryKey: schedulesQuery.queryKey, queryFn: read })
    rendered = useField(pageProps)

    return null
  }

  const root = createRoot(document.createElement('div'))

  const show = (shown: P) =>
    act(async () =>
      root.render(
        createElement(RouterContextProvider, {
          router,
          children: createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(Page, shown),
          ),
        }),
      ),
    )

  await show(props)

  return {
    field: () => {
      if (rendered === undefined) throw new Error('The editor never rendered')

      return rendered
    },
    show,
    // The leak in #83 is a listener left on the query cache itself.
    listening: () => queryClient.getQueryCache().hasListeners(),
    schedulesRefreshDue: () =>
      queryClient.getQueryState(schedulesQuery.queryKey)?.isInvalidated,
    close: () => act(async () => root.unmount()),
  }
}
