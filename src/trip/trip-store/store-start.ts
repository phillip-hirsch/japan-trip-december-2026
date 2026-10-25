// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option } from 'effect'
import { Migrator } from 'effect/sql'

import { birthdayDate } from '@/trip/domain/calendar'
import { ScheduleId } from '@/trip/domain/domain'
import type { Itinerary } from '@/trip/domain/domain'
import type { ScheduleCopy } from '@/trip/domain/schedule-copy'
import { Itineraries } from '@/trip/itineraries/Itineraries'
import { migrations } from '@/trip/schedule-store/migrations'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import { copyOf } from '@/trip/trip/Trip'

const runMigrations = Migrator.make({})({ loader: migrations })

/** The Itinerary's copy, its Birthday outline as December 15's Day note. */
const startingCopyOf = (itinerary: Itinerary): ScheduleCopy => {
  const copy = copyOf(itinerary)

  return {
    ...copy,
    days: copy.days.map((day) =>
      day.date === birthdayDate
        ? { ...day, note: itinerary.birthdayOutline }
        : day,
    ),
  }
}

/**
 * Starts the Schedule store: runs the migrations, then, if the store has no
 * Schedule, creates one from Option 1 in one transaction (ADR 0007). Running
 * it again changes nothing, so every screen always has a Schedule.
 */
export const startStore = Effect.gen(function* () {
  yield* runMigrations
  const { all } = yield* Itineraries
  const itinerary = all.find(({ optionNumber }) => optionNumber === 1)

  if (itinerary === undefined) {
    return yield* Effect.die(new Error('No Itinerary to start from'))
  }

  const store = yield* scheduleStore

  yield* store.transaction(
    Effect.gen(function* () {
      if (Option.isSome(yield* store.currentRecord)) return
      yield* store.insert(
        { id: ScheduleId.make(crypto.randomUUID()) },
        startingCopyOf(itinerary),
      )
    }),
  )
}).pipe(Effect.withSpan('startStore'))
