// Build tooling reads the Itinerary catalogue through the Trip service. Vite's
// module runner resolves the '@/' imports that plain `node` and the Vite
// config loader can't.
import { Effect } from 'effect'
import { runnerImport } from 'vite-plus'
import type { InlineConfig } from 'vite-plus'

import type { Trip } from '../src/trip/Trip.ts'

const viteConfig: InlineConfig = {
  configFile: false,
  resolve: { tsconfigPaths: true },
}

/** Runs `read` against the Trip service over the real Itinerary catalogue. */
export const readTrip = async <A>(
  read: (trip: Trip['Service']) => Effect.Effect<A>,
): Promise<A> => {
  const { Trip: TripService } = (
    await runnerImport<{ Trip: typeof Trip }>('/src/trip/Trip.ts', viteConfig)
  ).module

  return Effect.runPromise(
    TripService.use(read).pipe(Effect.provide(TripService.live)),
  )
}
