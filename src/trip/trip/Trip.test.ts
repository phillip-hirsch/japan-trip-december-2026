import { assert, layer } from '@effect/vitest'
import { Effect } from 'effect'

import type { RailSectionDetail } from '@/trip/domain/domain'
import { liveTrip } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const describeRailSection = ({ mode, line, from, to }: RailSectionDetail) =>
  `${mode} ${line} ${from.name} → ${to.name}`

layer(liveTrip)('Every Itinerary', (it) => {
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
          'shinkansen tokaido-shinkansen Kyoto → Odawara',
          'shinkansen tokaido-sanyo-shinkansen Kyoto → Hakata',
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

  it.effect('satisfies every Trip rule', () =>
    Effect.gen(function* () {
      const trip = yield* Trip

      for (const { optionNumber } of yield* trip.itineraries) {
        assert.deepStrictEqual(
          { optionNumber, breaks: yield* trip.tripRuleBreaks(optionNumber) },
          { optionNumber, breaks: [] },
        )
      }
    }),
  )

  it.effect('has exactly one recommended by gpt-6-astra', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      const itineraries = yield* trip.itineraries
      assert.strictEqual(
        itineraries.filter((itinerary) => itinerary.recommended).length,
        1,
      )
    }),
  )
})

layer(liveTrip)('Trip.itinerary', (it) => {
  it.effect('fails with ItineraryNotFound for an unknown Option number', () =>
    Effect.gen(function* () {
      const trip = yield* Trip
      const error = yield* Effect.flip(trip.itinerary(99))
      assert.deepStrictEqual(
        { tag: error._tag, optionNumber: error.optionNumber },
        { tag: 'ItineraryNotFound', optionNumber: 99 },
      )
    }),
  )
})
