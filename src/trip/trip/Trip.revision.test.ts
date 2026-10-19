import { assert, describe, it } from '@effect/vitest'
import { Effect, Struct } from 'effect'

import type { ItineraryContent } from '@/trip/domain/domain'
import { option2 } from '@/trip/itineraries/option-2'
import { currentSchedule, storage, tripWith } from '@/trip/trip/testing'
import {
  option1WithEveryAttachment,
  trip,
  firstChoose,
  chooseOption1,
  revisedOption1,
} from '@/trip/trip/Trip.schedule.testing'

describe('The Revision notice', () => {
  const statusUnder = (contents: ReadonlyArray<ItineraryContent>) =>
    currentSchedule.pipe(
      Effect.map((schedule) => schedule.sourceItinerary),
      Effect.provide(tripWith(contents)),
    )

  const chooseFromOption1 = chooseOption1(firstChoose).pipe(
    Effect.provide(trip),
  )

  it.effect('is absent while the source Itinerary is unchanged', () =>
    Effect.gen(function* () {
      yield* chooseFromOption1
      assert.strictEqual(
        yield* statusUnder([option1WithEveryAttachment, option2]),
        'unchanged',
      )
    }).pipe(Effect.provide(storage)),
  )

  it.effect('shows once the source Itinerary has had a Revision', () =>
    Effect.gen(function* () {
      yield* chooseFromOption1
      assert.strictEqual(
        yield* statusUnder([revisedOption1, option2]),
        'revised',
      )
    }).pipe(Effect.provide(storage)),
  )

  it.effect('says no longer available once the source Itinerary is gone', () =>
    Effect.gen(function* () {
      yield* chooseFromOption1
      assert.strictEqual(yield* statusUnder([option2]), 'unavailable')
    }).pipe(Effect.provide(storage)),
  )
})

describe('A Schedule', () => {
  it.effect('reads nothing back from Itinerary content after a Revision', () =>
    Effect.gen(function* () {
      const chosen = yield* chooseOption1(firstChoose).pipe(
        Effect.andThen(currentSchedule),
        Effect.provide(trip),
      )

      const afterRevision = yield* currentSchedule.pipe(
        Effect.provide(tripWith([revisedOption1])),
      )

      assert.deepStrictEqual(
        Struct.omit(afterRevision, ['sourceItinerary']),
        Struct.omit(chosen, ['sourceItinerary']),
      )
    }).pipe(Effect.provide(storage)),
  )
})
