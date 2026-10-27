import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { december, VerifyClaimAttachment } from '@/trip/domain/domain'
import { option1 } from '@/trip/itinerary/option-1'
import {
  currentSchedule,
  storageStartingFrom,
  testTrip,
} from '@/trip/trip/testing'
import { option1With } from '@/trip/trip/Trip.itinerary.testing'

describe('Free days', () => {
  it.effect('are not Days with a Day trip', () =>
    Effect.gen(function* () {
      const { days } = yield* currentSchedule

      assert.deepStrictEqual(
        days.filter((day) => day.freeDay).map((day) => day.date),
        [december(16)],
      )
    }).pipe(
      Effect.provide([
        testTrip,
        storageStartingFrom(
          option1With({
            dayTrips: [
              ...option1.dayTrips,
              { date: december(14), place: 'kamakura', optional: true },
            ],
          }),
        ),
      ]),
    ),
  )
})

describe('Verify claims', () => {
  it.effect('can be attached to the Schedule as a whole', () =>
    Effect.gen(function* () {
      const { verifyClaims } = yield* currentSchedule

      assert.deepStrictEqual(
        verifyClaims.map(({ text }) => text),
        ['Rail pass prices change in October.'],
      )
    }).pipe(
      Effect.provide([
        testTrip,
        storageStartingFrom(
          option1With({
            verifyClaims: [
              {
                id: 'rail-pass',
                text: 'Rail pass prices change in October.',
                attachedTo: VerifyClaimAttachment.cases.Itinerary.make({}),
              },
            ],
          }),
        ),
      ]),
    ),
  )
})
