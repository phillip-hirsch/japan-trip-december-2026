// Build tooling reads the Itinerary through the Trip service. Vite's
// module runner resolves the '@/' imports that plain `node` and the Vite
// config loader can't.
import { Effect } from 'effect'
import { runnerImport } from 'vite-plus'
import type { InlineConfig } from 'vite-plus'

import type { Trip } from '../src/trip/trip/Trip.ts'

const viteConfig: InlineConfig = {
  configFile: false,
  resolve: { tsconfigPaths: true },
}

export const readTrip = async <A>(
  read: (trip: Trip['Service']) => Effect.Effect<A>,
): Promise<A> => {
  const { Trip: TripService } = (
    await runnerImport<{ Trip: typeof Trip }>(
      '/src/trip/trip/Trip.ts',
      viteConfig,
    )
  ).module

  return Effect.runPromise(
    TripService.use(read).pipe(Effect.provide(TripService.live)),
  )
}
