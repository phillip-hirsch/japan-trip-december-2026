// Build tooling reads the Itinerary catalogue through the Trip service. Vite's
// module runner resolves the '@/' imports that plain `node` and the Vite
// config loader can't.
import { Context, Effect, Layer } from 'effect'
import { runnerImport } from 'vite-plus'
import type { InlineConfig } from 'vite-plus'

import type { Itineraries } from '../src/trip/Itineraries.ts'
import type { Trip } from '../src/trip/Trip.ts'

const viteConfig: InlineConfig = {
  configFile: false,
  resolve: { tsconfigPaths: true },
}

/** Runs `read` against the Trip service over the real Itinerary catalogue. */
export const readTrip = async <A>(
  read: (trip: Context.Service.Shape<typeof Trip>) => Effect.Effect<A>,
): Promise<A> => {
  const [tripModule, itinerariesModule] = await Promise.all([
    runnerImport<{ Trip: typeof Trip }>('/src/trip/Trip.ts', viteConfig),
    runnerImport<{ Itineraries: typeof Itineraries }>(
      '/src/trip/Itineraries.ts',
      viteConfig,
    ),
  ])
  const { Trip: TripService } = tripModule.module
  return Effect.runPromise(
    TripService.use(read).pipe(
      Effect.provide(
        TripService.layer.pipe(
          Layer.provide(itinerariesModule.module.Itineraries.layer),
        ),
      ),
    ),
  )
}
