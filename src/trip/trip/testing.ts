// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { deepStrictEqual } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { readFileSync } from 'node:fs'
import { EtagMismatch } from 'pmtiles'

import { DetailTileArchive } from '@/trip/detail-tiles/DetailTileArchive'
import { detailTilesKey } from '@/trip/detail-tiles/detail-tile-source'

import type {
  IsoDate,
  ItineraryContent,
  ScheduleDetail,
  ScheduleId,
} from '@/trip/domain/domain'
import { december, OperationId } from '@/trip/domain/domain'
import { Itineraries } from '@/trip/itineraries/Itineraries'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { LocationLinkResolver } from '@/trip/location-links/LocationLinkResolver'
import { migrations } from '@/trip/schedule-store/migrations'
import { recordedResponses } from '@/trip/location-links/recorded-location-links'
import { Trip } from '@/trip/trip/Trip'

export const storage = Layer.effectDiscard(
  SqliteMigrator.run({ loader: migrations }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })))

export const recordedLinks = LocationLinkResolver.of({
  request: (url) => {
    const response = recordedResponses[url.href]

    return response === undefined
      ? Effect.die(new Error(`No response recorded for ${url.href}`))
      : Effect.succeed(response)
  },
})

export const tripWith = (
  contents: ReadonlyArray<ItineraryContent>,
  links: LocationLinkResolver['Service'] = recordedLinks,
) =>
  Trip.layer.pipe(
    Layer.provide([
      Itineraries.fromContent(contents),
      Layer.succeed(LocationLinkResolver, links),
    ]),
  )

export const liveTrip = Trip.layer.pipe(
  Layer.provide([
    Itineraries.layer,
    Layer.succeed(LocationLinkResolver, recordedLinks),
  ]),
)

/** A Trip whose only Itinerary is Option 1. */
export const tripWithOption1 = tripWith([option1])

/** Option 1 with its Kyoto Stay split on December 11, both parts in Kyoto. */
export const option1WithTwoKyotoStays: ItineraryContent = {
  ...option1,
  stays: option1.stays.flatMap((stay) =>
    stay.base === 'kyoto'
      ? [
          { ...stay, checkOut: december(11), highlights: ['Fushimi Inari'] },
          { ...stay, checkIn: december(11), highlights: ['Kiyomizu-dera'] },
        ]
      : [stay],
  ),
  moves: [
    ...option1.moves,
    { date: december(11), mode: 'local' as const, sections: [] },
  ].sort((a, b) => a.date.localeCompare(b.date)),
}

/** A Trip offering Option 1 and Option 2. */
export const tripWithOptions1And2 = tripWith([option1, option2])

const fixture = (name: string) =>
  Uint8Array.from(readFileSync(new URL(name, import.meta.url)))

/** A real Detail tiles archive of two tiles of open ocean. */
export const openOcean = fixture('open-ocean.pmtiles')

/** The same, one tile further east at zoom 10. */
export const openOceanEast = fixture('open-ocean-east.pmtiles')

/**
 * An archive in memory that an upload can replace, as in the bucket. Each
 * upload has its own etag, and a read naming an older one fails as R2's does.
 * `holdNextRead` lets a test pause one read after it has taken its bytes,
 * as a slow response would, until `release`.
 */
export const replaceableArchive = (first: Uint8Array) => {
  let stored = first
  let upload = 1
  let hold: ((release: () => void) => void) | undefined

  const read = (offset: number, length: number, etag: string | undefined) =>
    etag !== undefined && etag !== `upload-${upload}`
      ? Promise.reject(new EtagMismatch())
      : Promise.resolve({
          data: stored.slice(offset, offset + length).buffer,
          etag: `upload-${upload}`,
        })

  const archive = DetailTileArchive.of({
    getKey: () => detailTilesKey,
    getBytes: (offset, length, _signal, etag) => {
      const result = read(offset, length, etag)
      const holding = hold
      hold = undefined

      if (holding === undefined) return result
      // Handled now, so a stale read held back isn't reported as unhandled;
      // the caller still gets its rejection once released.
      result.catch(() => undefined)

      return new Promise<void>((release) => holding(release)).then(() => result)
    },
  })

  const replace = (next: Uint8Array) => {
    stored = next
    upload += 1
  }

  /** Resolves, with its release, once the next read has taken its bytes. */
  const holdNextRead = () =>
    new Promise<() => void>((reached) => {
      hold = reached
    })

  return { archive, replace, holdNextRead }
}

export const openOceanArchive = replaceableArchive(openOcean).archive

export const unreadableArchive = DetailTileArchive.of({
  getKey: () => detailTilesKey,
  getBytes: () => Promise.reject(new Error('The bucket is unreachable')),
})

/** Sets the Clock to a moment given as an ISO 8601 UTC string. */
export const setTime = (instant: string) =>
  TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(instant)))

export const operation = (n: number) =>
  OperationId.make(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)

/**
 * Asserts a failure is the one expected, down to what it carries.
 * `assert.deepStrictEqual` compares errors by name and message alone, so it
 * can't tell one Hard rule from another.
 */
export const assertFailedWith = <E extends Error>(actual: E, expected: E) =>
  deepStrictEqual(actual, expected)

/** Chooses the Itinerary with this Option number, as operation `n`. */
export const choose = (
  optionNumber: number,
  n: number,
  replacing: ScheduleId | null,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

/** Chooses Option 1, as operation `n`. */
export const chooseOption1 = (n: number, replacing: ScheduleId | null) =>
  choose(1, n, replacing)

/** Restores an archived Schedule, as operation `n`. */
export const restore = (
  scheduleId: ScheduleId,
  n: number,
  replacing: ScheduleId,
) =>
  Trip.use((trip) =>
    trip.restore({ operationId: operation(n), scheduleId, replacing }),
  )

export const currentSchedule = Effect.map(
  Trip.use((trip) => trip.schedules),
  ({ current }) => Option.getOrThrow(current),
)

export const scheduleById = (scheduleId: ScheduleId) =>
  Trip.use((trip) => trip.schedule(scheduleId))

export const staysOf = (scheduleId: ScheduleId) =>
  Effect.map(scheduleById(scheduleId), ({ stays }) => stays)

export const stayIdAt = (schedule: ScheduleDetail, index: number) =>
  schedule.stays[index]?.id ?? ''

/** The Kyoto Stay, second in Option 1 and Option 2. */
export const kyotoStayId = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.id ?? '')

export const kyotoHotelOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.hotel)

export const activitiesOn = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).day.activities,
  )

export const tonightsHotel = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).tonight?.hotel,
  )

export const checklistItems = Effect.map(
  Trip.use((trip) => trip.checklist),
  ({ items }) => items,
)

export const tick = (scheduleId: ScheduleId, itemId: string, ticked = true) =>
  Trip.use((trip) => trip.tickChecklistItem({ scheduleId, itemId, ticked }))
