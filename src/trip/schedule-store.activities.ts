// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Effect, Option, Schema } from 'effect'
import { SqlSchema } from 'effect/sql'
import type { SqlClient } from 'effect/sql'

import {
  ActivityId,
  CopyId,
  IsoDate,
  ScheduleId,
  TokyoDateTime,
} from '@/trip/domain'
import type { Activity, Pin } from '@/trip/domain'
import {
  ofSchedule,
  ordered,
  sharedQueries,
  storedNote,
} from '@/trip/schedule-store.shared'

export const PinColumns = Schema.Struct({
  pinLatitude: Schema.NullOr(Schema.Finite),
  pinLongitude: Schema.NullOr(Schema.Finite),
  pinLink: Schema.NullOr(Schema.String),
})

export type PinColumns = typeof PinColumns.Type

export const pinColumnsOf = (pin: Pin | undefined): PinColumns => ({
  pinLatitude: pin?.coordinates.latitude ?? null,
  pinLongitude: pin?.coordinates.longitude ?? null,
  pinLink: pin?.link ?? null,
})

export const pinOf = ({
  pinLatitude,
  pinLongitude,
  pinLink,
}: PinColumns): Pin | undefined =>
  pinLatitude === null || pinLongitude === null
    ? undefined
    : {
        coordinates: { latitude: pinLatitude, longitude: pinLongitude },
        ...(pinLink !== null && { link: pinLink }),
      }

const ActivityRow = Schema.Struct({
  id: ActivityId,
  ...ofSchedule,
  date: IsoDate,
  ...ordered,
  title: Schema.String,
  time: Schema.NullOr(TokyoDateTime),
  note: Schema.NullOr(Schema.String),
  ...PinColumns.fields,
})

export const activityOf = ({
  id,
  title,
  time,
  note,
  ...pinColumns
}: typeof ActivityRow.Type): Activity => {
  const pin = pinOf(pinColumns)

  return {
    id,
    title,
    ...(time !== null && { time }),
    ...(note !== null && { note }),
    ...(pin && { pin }),
  }
}

export const activityRowOf = (
  scheduleId: ScheduleId,
  date: IsoDate,
  activity: Activity,
  position: number,
): typeof ActivityRow.Type => ({
  id: activity.id,
  title: activity.title,
  scheduleId,
  date,
  position,
  time: activity.time ?? null,
  note: activity.note ?? null,
  ...pinColumnsOf(activity.pin),
})

export interface ActivityChanges {
  readonly title?: string
  readonly time?: TokyoDateTime | null
  readonly note?: string
}

/** The Activities of a Schedule copy, read and written. */
export const activityCopyQueries = (sql: SqlClient.SqlClient) => {
  const { inserter, rowsOf } = sharedQueries(sql)

  const insertActivity = inserter('activities', ActivityRow)

  const findActivities = rowsOf(
    ActivityRow,
    (id) =>
      sql`SELECT * FROM activities WHERE scheduleId = ${id} ORDER BY date, position`,
  )

  return { insertActivity, findActivities }
}

/** The Activities and Pins of a Schedule. */
export const activityQueries = (sql: SqlClient.SqlClient) => {
  const { insertActivity } = activityCopyQueries(sql)

  const updatePin = (table: 'activities' | 'stays') =>
    SqlSchema.void({
      Request: Schema.Struct({
        scheduleId: ScheduleId,
        id: CopyId,
        ...PinColumns.fields,
      }),
      execute: ({ scheduleId, id, ...columns }) =>
        sql`
          UPDATE ${sql(table)} SET ${sql.update(columns)}
          WHERE scheduleId = ${scheduleId} AND id = ${id}
        `,
    })

  const updateActivityPin = updatePin('activities')

  const updateHotelPin = updatePin('stays')

  const DayKey = Schema.Struct({ scheduleId: ScheduleId, date: IsoDate })

  const ActivityKey = Schema.Struct({
    scheduleId: ScheduleId,
    id: ActivityId,
  })

  const findActivitiesOn = SqlSchema.findAll({
    Request: DayKey,
    Result: ActivityRow,
    execute: ({ scheduleId, date }) =>
      sql`
        SELECT * FROM activities WHERE scheduleId = ${scheduleId} AND date = ${date}
        ORDER BY position
      `,
  })

  const findActivityDate = SqlSchema.findOneOption({
    Request: ActivityKey,
    Result: Schema.Struct({ date: IsoDate }),
    execute: ({ scheduleId, id }) =>
      sql`SELECT date FROM activities WHERE scheduleId = ${scheduleId} AND id = ${id}`,
  })

  const updateActivity = SqlSchema.void({
    Request: Schema.Struct({
      ...ActivityKey.fields,
      title: Schema.optionalKey(Schema.String),
      time: Schema.optionalKey(Schema.NullOr(TokyoDateTime)),
      note: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
    execute: ({ scheduleId, id, ...changes }) =>
      sql`
        UPDATE activities SET ${sql.update(changes)}
        WHERE scheduleId = ${scheduleId} AND id = ${id}
      `,
  })

  const deleteActivity = SqlSchema.void({
    Request: ActivityKey,
    execute: ({ scheduleId, id }) =>
      sql`DELETE FROM activities WHERE scheduleId = ${scheduleId} AND id = ${id}`,
  })

  const updateActivityPosition = SqlSchema.void({
    Request: Schema.Struct({ ...ActivityKey.fields, ...ordered }),
    execute: ({ scheduleId, id, position }) =>
      sql`
        UPDATE activities SET position = ${position}
        WHERE scheduleId = ${scheduleId} AND id = ${id}
      `,
  })

  return {
    /** The Activities on a Day of a Schedule, in the order kept. */
    activitiesOn: (scheduleId: ScheduleId, date: IsoDate) =>
      Effect.map(findActivitiesOn({ scheduleId, date }), (rows) =>
        rows.map(activityOf),
      ),

    activityDate: (scheduleId: ScheduleId, id: string) =>
      Effect.map(
        findActivityDate({ scheduleId, id }),
        Option.map(({ date }) => date),
      ),

    /**
     * Stores a new Activity on a Day of a Schedule, at a position until the
     * Day's order is next written.
     */
    addActivity: (
      scheduleId: ScheduleId,
      date: IsoDate,
      activity: Activity,
      position: number,
    ) => insertActivity(activityRowOf(scheduleId, date, activity, position)),

    editActivity: (
      scheduleId: ScheduleId,
      id: string,
      { note, ...changes }: ActivityChanges,
    ) => {
      const stored = {
        ...changes,
        ...(note !== undefined && { note: storedNote(note) }),
      }

      return Object.keys(stored).length === 0
        ? Effect.void
        : updateActivity({ scheduleId, id, ...stored })
    },

    removeActivity: (scheduleId: ScheduleId, id: string) =>
      deleteActivity({ scheduleId, id }),

    writeActivityOrder: (scheduleId: ScheduleId, ids: ReadonlyArray<string>) =>
      Effect.forEach(
        ids,
        (id, position) => updateActivityPosition({ scheduleId, id, position }),
        { discard: true },
      ),

    /** Replaces the Pin on a Schedule's Activity; none removes it. */
    writeActivityPin: (scheduleId: ScheduleId, id: string, pin?: Pin) =>
      updateActivityPin({ scheduleId, id, ...pinColumnsOf(pin) }),

    /** Replaces the Pin on a Stay's hotel; none removes it. */
    writeHotelPin: (scheduleId: ScheduleId, stayId: string, pin?: Pin) =>
      updateHotelPin({ scheduleId, id: stayId, ...pinColumnsOf(pin) }),
  }
}
