import { assert, describe, it, layer } from '@effect/vitest'
import { Effect, Predicate, Schema } from 'effect'

import { december, ItineraryContent } from '@/trip/domain/domain'
import type { RailSectionDetail } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { liveTrip, tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'
import { option1With } from '@/trip/trip/Trip.itinerary.testing'

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

describe('Itinerary content version', () => {
  const versionOf = (content: ItineraryContent) =>
    Trip.use((trip) => trip.itinerary(content.optionNumber)).pipe(
      Effect.map((itinerary) => itinerary.contentVersion),
      Effect.provide(tripWith([content])),
    )

  const reverseKeys = (value: Schema.Json): Schema.Json => {
    if (Array.isArray(value)) return value.map(reverseKeys)

    if (Predicate.isObjectKeyword(value)) {
      return Object.fromEntries(
        Object.entries<Schema.Json>(value)
          .reverse()
          .map(([key, nested]) => [key, reverseKeys(nested)]),
      )
    }

    return value
  }

  const reencoded = (content: ItineraryContent): ItineraryContent => {
    const reordered = reverseKeys(
      Schema.decodeSync(Schema.fromJsonString(Schema.Json))(
        JSON.stringify(content),
      ),
    )

    if (!Schema.is(ItineraryContent)(reordered))
      return assert.fail('Re-encoding must preserve Itinerary content')

    return reordered
  }

  it.effect('stays the same when the data is re-encoded', () =>
    Effect.gen(function* () {
      const reordered = reencoded(option1)
      assert.deepStrictEqual(
        Object.keys(reordered),
        Object.keys(option1).reverse(),
      )
      assert.strictEqual(yield* versionOf(reordered), yield* versionOf(option1))
    }),
  )

  it.effect('changes when any field changes', () =>
    Effect.gen(function* () {
      const original = yield* versionOf(option1)

      const changed: ReadonlyArray<ItineraryContent> = [
        option1With({ name: 'Kyoto + Kanazawa, revised' }),
        option1With({ bestFor: 'Crab season' }),
        option1With({ recommended: false }),
        option1With({ cons: [...option1.cons, 'Long train days.'] }),
        option1With({ chooseThisIf: 'you want gardens and crafts.' }),
        option1With({
          days: option1.days.map((day) =>
            day.date === december(14)
              ? { ...day, description: 'Kenrokuen.' }
              : day,
          ),
        }),
        option1With({
          stays: option1.stays.map((stay, index) =>
            index === 2 ? { ...stay, base: 'hakone' } : stay,
          ),
        }),
        option1With({
          shigeharuVisit: { date: december(10), slot: 'morning' },
        }),
        option1With({
          stays: option1.stays.map((stay) => ({
            ...stay,
            highlights: [...stay.highlights, 'Gold leaf ice cream'],
          })),
        }),
        option1With({
          moves: option1.moves.map((move) => ({
            ...move,
            duration: { minMinutes: 120, maxMinutes: 180 },
          })),
        }),
        option1With({
          dayTrips: option1.dayTrips.map((dayTrip) => ({
            ...dayTrip,
            optional: !dayTrip.optional,
          })),
        }),
        option1With({
          verifyClaims: option1.verifyClaims.map((claim) => ({
            ...claim,
            text: `${claim.text} Confirmed.`,
          })),
        }),
      ]

      for (const content of changed) {
        assert.notStrictEqual(yield* versionOf(content), original)
      }
    }),
  )
})
