import { createHash } from 'node:crypto'

import { assert, describe, it } from '@effect/vitest'
import { Predicate, SchemaRepresentation } from 'effect'
import { vi } from 'vite-plus/test'

import { keptDataVersion } from '@/trip/client/device-cache'
import {
  checklistQuery,
  dayQuery,
  homeQuery,
  keys,
  scheduleMapQuery,
  schedulesQuery,
} from '@/trip/client/queries'
import {
  Checklist,
  DayOutcome,
  december,
  HomeState,
  ScheduleMap,
  Schedules,
} from '@/trip/domain/domain'

// The queries' keys are all this reads; the transport needs the Worker.
vi.mock('@/trip/trip/trip.functions', () => ({}))

// Each query the device keeps, with the schema of the data it holds: the
// result of the Trip store operation it reads. A Day query holds the page of
// DayOutcome's Day case.
const keptQueries = [
  { key: homeQuery.queryKey, data: HomeState },
  { key: dayQuery(december(14)).queryKey, data: DayOutcome },
  { key: schedulesQuery.queryKey, data: Schedules },
  { key: checklistQuery.queryKey, data: Checklist },
  { key: scheduleMapQuery.queryKey, data: ScheduleMap },
] as const

// Queries marked `meta: { kept: false }`, which the device never keeps.
const notKept = [keys.scheduleSnapshot]

// The fingerprint of the kept data at each keptDataVersion. Add one entry per
// bump, and never change an older entry.
const fingerprints = new Map([[5, 'c5aeb099d3c8bcdb']])

/**
 * A hash of every kept query's key and of the full schema of its data, type
 * and encoding, with checks and annotations. A documentation change moves it
 * too; bumping for one is harmless, since the app only reads the data again.
 */
const keptDataFingerprint = () => {
  const [first, ...rest] = keptQueries.map(({ data }) => data.ast)

  const schemas = SchemaRepresentation.toRepresentations([first, ...rest])

  const json = JSON.stringify(
    { keys: keptQueries.map(({ key }) => key), schemas },
    (_key, value) =>
      Predicate.isFunction(value) || Predicate.isSymbol(value)
        ? String(value)
        : value,
  )

  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

describe('keptDataVersion', () => {
  it('covers every query, kept or not', () => {
    const covered = [...keptQueries.map(({ key }) => key), ...notKept]
      .map(([root]) => root)
      .sort()

    assert.deepStrictEqual(
      covered,
      Object.values(keys)
        .map(([root]) => root)
        .sort(),
      'Every query key in src/trip/client/queries.reads.ts must appear in keptQueries in this file, with the schema of the data it holds, or in notKept if it has meta: { kept: false }.',
    )
  })

  it('names the shape of the data the device keeps', () => {
    const fingerprint = keptDataFingerprint()
    const recorded = fingerprints.get(keptDataVersion)

    const fix =
      recorded === undefined
        ? `Add [${keptDataVersion}, '${fingerprint}'] to fingerprints in this file.`
        : `Bump keptDataVersion in src/trip/client/device-cache.ts to ${keptDataVersion + 1}, so the app discards what an older version kept instead of reading it, and add [${keptDataVersion + 1}, '${fingerprint}'] to fingerprints in this file. Leave the older entries as they are.`

    assert.strictEqual(
      fingerprint,
      recorded,
      `A kept query's key or the shape of its data changed. ${fix}`,
    )
  })
})
