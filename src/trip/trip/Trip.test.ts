import { assert, layer } from '@effect/vitest'
import { Effect } from 'effect'

import type { RailSectionDetail } from '@/trip/domain/domain'
import { testTrip } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const describeRailSection = ({ mode, line, from, to }: RailSectionDetail) =>
  `${mode} ${line} ${from.name} → ${to.name}`

layer(testTrip)('The Itinerary', (it) => {
  it.effect('rides each rail section once, whichever way it’s ridden', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      assert.deepStrictEqual(
        (yield* trip.railSections).map(describeRailSection),
        [
          'shinkansen tokaido-shinkansen Tokyo → Kyoto',
          'limited-express thunderbird Kyoto → Tsuruga',
          'shinkansen hokuriku-shinkansen Tsuruga → Kanazawa',
          'shinkansen hokuriku-shinkansen Kanazawa → Tokyo',
        ],
      )
    }),
  )

  it.effect('follows the rail line on every rail section', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      assert.deepStrictEqual(
        (yield* trip.railSections)
          .filter((section) => !section.followsRailLine)
          .map(describeRailSection),
        [],
      )
    }),
  )
})
