// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act, createElement, lazy, Suspense } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { deferred } from '@/trip/client/editor-testing'
import { testQueryClient } from '@/trip/client/hook-testing'
import { useScheduleSummary } from '@/trip/client/queries'
import { ScheduleId } from '@/trip/domain/domain'
import type { ScheduleSummary } from '@/trip/domain/domain'
import { getScheduleSummary } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  getScheduleSummary: vi.fn(),
}))

/** The summary of Phillip's Schedule, as the server answers it. */
const currentSchedule: ScheduleSummary = {
  id: ScheduleId.make('00000000-0000-4000-8000-00000000000a'),
  sourceOptionNumber: 1,
}

vi.mocked(getScheduleSummary).mockImplementation(async () => currentSchedule)

const shown = (summary: ScheduleSummary | null | undefined) =>
  summary === undefined
    ? 'not yet known'
    : summary === null
      ? 'no Schedule'
      : `a Schedule from Option ${summary.sourceOptionNumber}`

/** A reader of the Schedule summary, recording what each render returned. */
const reader = () => {
  const returned: Array<string> = []

  const Reader = () => {
    const summary = useScheduleSummary()
    returned.push(shown(summary))

    return createElement('p', null, shown(summary))
  }

  return { returned, Reader }
}

const withClient = (queryClient: QueryClient, ...children: Array<ReactNode>) =>
  createElement(QueryClientProvider, { client: queryClient }, ...children)

/** The app nav, and a page below it in a Suspense boundary. */
const app = (
  queryClient: QueryClient,
  nav: ComponentType,
  page: ComponentType,
) =>
  withClient(
    queryClient,
    createElement(nav),
    createElement(Suspense, { fallback: null }, createElement(page)),
  )

/** Lets pending reads answer and the renders they cause finish. */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

/** A query client the app nav has already read the Schedule summary into. */
const withSummaryRead = async () => {
  const queryClient = testQueryClient()
  const nav = reader()
  const root = createRoot(document.createElement('div'))
  await act(async () =>
    root.render(withClient(queryClient, createElement(nav.Reader))),
  )
  await settle()
  assert.strictEqual(nav.returned.at(-1), shown(currentSchedule))

  return { queryClient, unmountNav: () => act(async () => root.unmount()) }
}

describe('the Schedule summary', () => {
  it('is not yet known on the first render hydrating a code-split page, though the app nav already read it', async () => {
    // The server renders the whole page, without the Schedule summary.
    const container = document.createElement('div')
    container.innerHTML = renderToString(
      app(testQueryClient(), reader().Reader, reader().Reader),
    )

    const nav = reader()
    const page = reader()

    // In the browser, the page's code arrives after the app nav has hydrated
    // and read the summary.
    const pageCode = deferred<{ default: ComponentType }>()
    const mismatches: Array<unknown> = []

    const root = await act(async () =>
      hydrateRoot(
        container,
        app(
          testQueryClient(),
          nav.Reader,
          lazy(() => pageCode.promise),
        ),
        // React reports a hydration mismatch through this callback.
        { onRecoverableError: (error) => mismatches.push(error) },
      ),
    )

    await settle()
    assert.strictEqual(nav.returned.at(-1), shown(currentSchedule))

    await act(async () => pageCode.resolve({ default: page.Reader }))
    await settle()

    assert.deepStrictEqual(
      {
        firstRender: page.returned[0],
        afterHydration: page.returned.at(-1),
        mismatches,
      },
      {
        firstRender: shown(undefined),
        afterHydration: shown(currentSchedule),
        mismatches: [],
      },
    )
    await act(async () => root.unmount())
  })

  it('is shown at once by a reader mounted after hydration', async () => {
    const { queryClient, unmountNav } = await withSummaryRead()

    const page = reader()
    const root = createRoot(document.createElement('div'))
    await act(async () =>
      root.render(withClient(queryClient, createElement(page.Reader))),
    )

    assert.strictEqual(page.returned[0], shown(currentSchedule))
    await act(async () => root.unmount())
    await unmountNav()
  })

  it('is never in a server render, even when already read', async () => {
    const { queryClient, unmountNav } = await withSummaryRead()

    const page = reader()
    renderToString(withClient(queryClient, createElement(page.Reader)))

    assert.deepStrictEqual(page.returned, [shown(undefined)])
    await unmountNav()
  })
})
