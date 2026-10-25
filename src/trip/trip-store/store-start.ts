// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option } from 'effect'
import { Migrator } from 'effect/sql'

import { ScheduleId } from '@/trip/domain/domain'
import { Itinerary } from '@/trip/itinerary/Itinerary'
import { migrations } from '@/trip/schedule-store/migrations'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import { copyOf } from '@/trip/trip/Trip'

const runMigrations = Migrator.make({})({ loader: migrations })

/**
 * Starts the Schedule store: runs the migrations, then, if the store has no
 * Schedule, creates one from the Itinerary in one transaction (ADR 0007). Running
 * it again changes nothing, so every screen always has a Schedule.
 */
export const startStore = Effect.gen(function* () {
  yield* runMigrations
  const itinerary = yield* Itinerary
  const store = yield* scheduleStore

  yield* store.transaction(
    Effect.gen(function* () {
      if (Option.isSome(yield* store.currentRecord)) return
      yield* store.insert(
        { id: ScheduleId.make(crypto.randomUUID()) },
        copyOf(itinerary),
      )
    }),
  )
}).pipe(Effect.withSpan('startStore'))
