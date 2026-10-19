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
import { isDeepStrictEqual } from 'node:util'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import type { PlaceId } from '@/trip/catalogue/catalogue-ids'
import { places } from '@/trip/catalogue/places'
import { SaveState } from '@/trip/client/drafts'
import { schedulesQuery } from '@/trip/client/queries'
import { nightsBetween } from '@/trip/domain/calendar'
import {
  december,
  Hotel,
  IsoInstant,
  ScheduleId,
  StayEditOutcome,
} from '@/trip/domain/domain'
import type { AnchorWarning, ScheduleStayDetail } from '@/trip/domain/domain'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

export const deferred = <A>() => {
  let resolve: (value: A) => void = () => undefined

  const promise = new Promise<A>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}

/** Why a NotSaved value isn't saved; nothing for any other state. */
export const notSavedProblem = <V>(state: SaveState<V>) =>
  SaveState.$is('NotSaved')(state) ? state.problem : undefined

/**
 * Presses Save with `save`, before its answer comes. Await `finished` for
 * the answer.
 */
export const startSaving = async (save: () => Promise<void>) => {
  let finished: Promise<void> = Promise.resolve()
  await act(async () => {
    finished = save()
  })

  return { finished }
}

/**
 * A server function that answers `written` only to a request carrying exactly
 * `expected`, and `refused` to any other, so a saved value shows what was
 * sent.
 */
export const answeringOnly =
  <E, W, R>(expected: E, written: W, refused: R) =>
  async <D>({ data }: { readonly data: D }) =>
    isDeepStrictEqual(data, expected) ? written : refused

/** A request to a write the Trip replays by operation id. */
interface UnderOperation {
  readonly operationId: string
  readonly scheduleId?: string
}

/**
 * Like `answeringOnly`, for a write sent under an operation. It answers
 * `written` only to a request carrying exactly `expected`, whatever its
 * operation id.
 */
export const answeringOnlyUnderAnyOperation =
  <E, W, R>(expected: E, written: W, refused: R) =>
  async <D extends UnderOperation>({ data }: { readonly data: D }) =>
    isDeepStrictEqual(
      Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== 'operationId'),
      ),
      expected,
    )
      ? written
      : refused

/**
 * A write sent under an operation whose first request lands but gets no
 * answer. It answers each later request `written` when `retried` says it
 * suits the first, and `refused` otherwise.
 */
export const losingFirstAnswer = <W, R>(
  retried: (request: UnderOperation, first: UnderOperation) => boolean,
  written: W,
  refused: R,
) => {
  let first: UnderOperation | undefined

  return async <D extends UnderOperation>({ data }: { readonly data: D }) => {
    if (first === undefined) {
      first = data
      throw new Error('The answer was lost')
    }

    return retried(data, first) ? written : refused
  }
}

/**
 * A page showing the Schedules, read with `read`, and an editor on it whose
 * field is `useField(props)`. Opening it again after closing it acts as a
 * reload, so only Drafts kept on the device carry over. The page has a router
 * because the server functions hand it any redirect.
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
    /** The Schedules the page shows, as last read. */
    schedulesShown: () =>
      // `read` returns strings, not Schedules, so the key drops its data type.
      queryClient.getQueryData<string>([...schedulesQuery.queryKey]),
    schedulesRefreshDue: () =>
      queryClient.getQueryState(schedulesQuery.queryKey)?.isInvalidated,
    close: () => act(async () => root.unmount()),
  }
}

/** The Schedule shown, in the Stay edit tests. */
export const scheduleId = ScheduleId.make(
  '00000000-0000-4000-8000-00000000000a',
)

/**
 * A Stay of the Schedule shown, in `base` from December `checkIn` to
 * December `checkOut`, with no hotel details or note.
 */
export const scheduleStay = (
  id: string,
  base: PlaceId,
  checkIn: number,
  checkOut: number,
): ScheduleStayDetail => ({
  id,
  base: { id: base, ...places[base], newPlace: false },
  checkIn: december(checkIn),
  checkOut: december(checkOut),
  nights: nightsBetween(december(checkIn), december(checkOut)),
  accommodation: 'hotel',
  highlights: [],
  verifyClaims: [],
  hotel: Hotel.cases.NotRecorded.make({}),
})

/** A Stay edit that went through, leaving the Schedule with `anchorWarnings`. */
export const staysEdited = (
  anchorWarnings: ReadonlyArray<AnchorWarning> = [],
): StayEditOutcome =>
  StayEditOutcome.cases.Edited.make({
    schedule: {
      id: scheduleId,
      status: 'current',
      sourceOptionNumber: 1,
      sourceContentVersion: 'v1',
      chosenAt: IsoInstant.make('2026-10-01T00:00:00.000Z'),
      archivedAt: null,
      birthdayOutline: '',
      sourceItinerary: 'unchanged',
      verifyClaims: [],
      stays: [],
      days: [],
      anchorWarnings,
    },
  })
