// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vite-plus/test'
import { act, createElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { useScheduleSummary } from '@/trip/client/queries'
import { ScheduleId } from '@/trip/domain/domain'
import type { ScheduleSummary } from '@/trip/domain/domain'
import { getScheduleSummary } from '@/trip/trip/trip.functions'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

vi.mock('@/trip/trip/trip.functions', () => ({
  getScheduleSummary: vi.fn(),
}))

const current: ScheduleSummary = {
  id: ScheduleId.make('00000000-0000-4000-8000-00000000000a'),
  sourceOptionNumber: 1,
}

vi.mocked(getScheduleSummary).mockImplementation(async () => current)

const shown = (summary: ScheduleSummary | null | undefined) =>
  summary === undefined
    ? 'not yet known'
    : summary === null
      ? 'no Schedule'
      : `Schedule from Option ${summary.sourceOptionNumber}`

/** A reader of the Schedule summary, recording what each render returned. */
const reader = (queryClient: QueryClient) => {
  const returned: Array<string> = []

  const Reader = () => {
    const summary = useScheduleSummary()
    returned.push(shown(summary))

    return createElement('p', null, shown(summary))
  }

  return {
    returned,
    element: createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Reader),
    ),
  }
}

/** Lets pending reads answer and the renders they cause finish. */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

/** A query client the app nav has already read the Schedule summary into. */
const withSummaryRead = async () => {
  const queryClient = newQueryClient()
  const nav = reader(queryClient)
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(nav.element))
  await settle()
  assert.strictEqual(nav.returned.at(-1), shown(current))

  return { queryClient, unmountNav: () => act(async () => root.unmount()) }
}

describe('the Schedule summary', () => {
  it('is not yet known on the first render hydrating a page, even when already read', async () => {
    const { queryClient, unmountNav } = await withSummaryRead()

    // The server renders without the Schedule summary.
    const container = document.createElement('div')
    container.innerHTML = renderToString(reader(newQueryClient()).element)

    const page = reader(queryClient)
    const mismatches: Array<unknown> = []

    const root = await act(async () =>
      hydrateRoot(container, page.element, {
        onRecoverableError: (error) => mismatches.push(error),
      }),
    )

    await settle()

    assert.deepStrictEqual(
      {
        firstRender: page.returned[0],
        afterHydration: page.returned.at(-1),
        mismatches,
      },
      {
        firstRender: shown(undefined),
        afterHydration: shown(current),
        mismatches: [],
      },
    )
    await act(async () => root.unmount())
    await unmountNav()
  })

  it('is shown at once by a reader mounted after hydration', async () => {
    const { queryClient, unmountNav } = await withSummaryRead()

    const page = reader(queryClient)
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(page.element))

    assert.strictEqual(page.returned[0], shown(current))
    await act(async () => root.unmount())
    await unmountNav()
  })

  it('is never in a server render, even when already read', async () => {
    const { queryClient, unmountNav } = await withSummaryRead()

    const page = reader(queryClient)
    renderToString(page.element)

    assert.deepStrictEqual(page.returned, [shown(undefined)])
    await unmountNav()
  })
})
