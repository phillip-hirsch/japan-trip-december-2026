// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
// How Schedules, the Trip note and the Checklist are stored, row by row, with
// the operation ids of writes that carry one and their results. Only the Trip
// service uses it, inside the Durable Object or over Node's SQLite in the
// tests; tables stay behind it.
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { Statement } from 'effect/sql'

import {
  ActivityId,
  ArchivedScheduleSummary,
  ChecklistItemId,
  CopyId,
  DayTrip,
  DurationRange,
  IsoDate,
  Move,
  OperationId,
  ScheduleAnchor,
  ScheduleId,
  ScheduleRecord,
  Stay,
  VerifyClaim,
  VerifyClaimAttachment,
} from '@/trip/domain'
import type { Activity, Day } from '@/trip/domain'

type Copied<A> = A & { readonly id: string }

/** A Stay of a Schedule, with Phillip's Stay note once he writes one. */
export type ScheduleStay = Copied<Stay> & { readonly note?: string }

/**
 * A Day of a Schedule, with Phillip's Day note once he writes one and his
 * Activities, in the order he keeps them.
 */
export type ScheduleDay = Day & {
  readonly note?: string
  readonly activities: ReadonlyArray<Activity>
}

/**
 * Everything a Schedule copies from the Itinerary chosen, each Stay, Move, Day
 * trip, Verify claim and Anchor with its own id, and Phillip's Stay and Day
 * notes and Activities.
 */
export interface ScheduleCopy {
  readonly stays: ReadonlyArray<ScheduleStay>
  readonly days: ReadonlyArray<ScheduleDay>
  readonly moves: ReadonlyArray<Copied<Move>>
  readonly dayTrips: ReadonlyArray<Copied<DayTrip>>
  readonly verifyClaims: ReadonlyArray<VerifyClaim>
  readonly anchors: ReadonlyArray<ScheduleAnchor>
}

// Rows: lists and unions are stored as JSON, and lists of entities keep the
// Itinerary's order by position.
const ofSchedule = { scheduleId: ScheduleId }

const ordered = { position: Schema.Int }

/** A note as stored: null for an empty one, which removes it. */
const storedNote = (note: string) => (note === '' ? null : note)

const StayRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...Stay.fields,
  highlights: Schema.fromJsonString(Stay.fields.highlights),
  note: Schema.NullOr(Schema.String),
})

const DayRow = Schema.Struct({
  ...ofSchedule,
  date: IsoDate,
  description: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
})

const MoveRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  date: IsoDate,
  mode: Move.fields.mode,
  sections: Schema.fromJsonString(Move.fields.sections),
  duration: Schema.NullOr(Schema.fromJsonString(DurationRange)),
})

const DayTripRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...ordered,
  ...DayTrip.fields,
  optional: Schema.BooleanFromBit,
})

const VerifyClaimRow = Schema.Struct({
  ...ofSchedule,
  ...ordered,
  ...VerifyClaim.fields,
  attachedTo: Schema.fromJsonString(VerifyClaimAttachment),
})

const AnchorRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...ordered,
  anchor: Schema.fromJsonString(ScheduleAnchor),
})

const ActivityRow = Schema.Struct({
  id: ActivityId,
  ...ofSchedule,
  date: IsoDate,
  ...ordered,
  title: Schema.String,
  time: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
})

const activityOf = ({
  id,
  title,
  time,
  note,
}: typeof ActivityRow.Type): Activity => ({
  id,
  title,
  ...(time !== null && { time }),
  ...(note !== null && { note }),
})

/** An Activity's row on a Day of a Schedule, at a position. */
const activityRowOf = (
  scheduleId: ScheduleId,
  date: IsoDate,
  activity: Activity,
  position: number,
): typeof ActivityRow.Type => ({
  ...activity,
  scheduleId,
  date,
  position,
  time: activity.time ?? null,
  note: activity.note ?? null,
})

/**
 * The fields an Activity edit writes, as stored: a null time or note removes
 * it.
 */
export interface ActivityChanges {
  readonly title?: string
  readonly time?: string | null
  readonly note?: string
}

const OwnChecklistItemRow = Schema.Struct({
  id: ChecklistItemId,
  text: Schema.String,
  reminderDate: Schema.NullOr(IsoDate),
  ticked: Schema.BooleanFromBit,
})

/** One of Phillip's own Checklist items, as stored. */
export type OwnChecklistItem = typeof OwnChecklistItemRow.Type

export type ScheduleStore = Effect.Success<typeof scheduleStore>

/** The storage operations, over the SQL client in context. */
export const scheduleStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const insertInto = (table: string) => (row: Schema.JsonObject) =>
    sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`

  const inserter = <S extends Schema.Encoder<Schema.JsonObject>>(
    table: string,
    Request: S,
  ) =>
    SqlSchema.void({
      Request,
      execute: insertInto(table),
    })

  const insertSchedule = inserter('schedules', ScheduleRecord)
  const insertStay = inserter('stays', StayRow)
  const insertDay = inserter('days', DayRow)
  const insertMove = inserter('moves', MoveRow)
  const insertDayTrip = inserter('dayTrips', DayTripRow)
  const insertVerifyClaim = inserter('verifyClaims', VerifyClaimRow)
  const insertAnchor = inserter('anchors', AnchorRow)
  const insertActivity = inserter('activities', ActivityRow)

  const findCurrent = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: ScheduleRecord,
    execute: () => sql`SELECT * FROM schedules WHERE status = 'current'`,
  })

  const findById = SqlSchema.findOneOption({
    Request: ScheduleId,
    Result: ScheduleRecord,
    execute: (id) => sql`SELECT * FROM schedules WHERE id = ${id}`,
  })

  const findArchived = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ArchivedScheduleSummary,
    execute: () =>
      sql`
        SELECT id, sourceOptionNumber, chosenAt, archivedAt FROM schedules
        WHERE status = 'archived' ORDER BY archivedAt DESC
      `,
  })

  const archiveSchedule = SqlSchema.void({
    Request: Schema.Struct({ id: ScheduleId, archivedAt: Schema.String }),
    execute: ({ id, archivedAt }) =>
      sql`
        UPDATE schedules SET status = 'archived', archivedAt = ${archivedAt}
        WHERE id = ${id}
      `,
  })

  const makeScheduleCurrent = SqlSchema.void({
    Request: ScheduleId,
    execute: (id) =>
      sql`
        UPDATE schedules SET status = 'current', archivedAt = NULL
        WHERE id = ${id}
      `,
  })

  const findDay = SqlSchema.findOneOption({
    Request: Schema.Struct({ scheduleId: ScheduleId, date: IsoDate }),
    Result: Schema.Struct({ date: IsoDate }),
    execute: ({ scheduleId, date }) =>
      sql`SELECT date FROM days WHERE scheduleId = ${scheduleId} AND date = ${date}`,
  })

  const updateDayNote = SqlSchema.void({
    Request: Schema.Struct({
      scheduleId: ScheduleId,
      date: IsoDate,
      note: Schema.NullOr(Schema.String),
    }),
    execute: ({ scheduleId, date, note }) =>
      sql`
        UPDATE days SET note = ${note}
        WHERE scheduleId = ${scheduleId} AND date = ${date}
      `,
  })

  const findStay = SqlSchema.findOneOption({
    Request: Schema.Struct({ scheduleId: ScheduleId, stayId: CopyId }),
    Result: Schema.Struct({ id: CopyId }),
    execute: ({ scheduleId, stayId }) =>
      sql`SELECT id FROM stays WHERE scheduleId = ${scheduleId} AND id = ${stayId}`,
  })

  const updateStayNote = SqlSchema.void({
    Request: Schema.Struct({
      scheduleId: ScheduleId,
      stayId: CopyId,
      note: Schema.NullOr(Schema.String),
    }),
    execute: ({ scheduleId, stayId, note }) =>
      sql`
        UPDATE stays SET note = ${note}
        WHERE scheduleId = ${scheduleId} AND id = ${stayId}
      `,
  })

  const findTripNote = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ note: Schema.String }),
    execute: () => sql`SELECT note FROM tripNote WHERE id = 1`,
  })

  const upsertTripNote = SqlSchema.void({
    Request: Schema.String,
    execute: (note) =>
      sql`
        INSERT INTO tripNote (id, note) VALUES (1, ${note})
        ON CONFLICT (id) DO UPDATE SET note = excluded.note
      `,
  })

  const deleteTripNote = SqlSchema.void({
    Request: Schema.Void,
    execute: () => sql`DELETE FROM tripNote`,
  })

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
      time: Schema.optionalKey(Schema.NullOr(Schema.String)),
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

  const findTicks = SqlSchema.findAll({
    Request: ScheduleId,
    Result: Schema.Struct({ itemId: ChecklistItemId }),
    execute: (scheduleId) =>
      sql`SELECT itemId FROM checklistTicks WHERE scheduleId = ${scheduleId}`,
  })

  const TickRow = Schema.Struct({
    scheduleId: ScheduleId,
    itemId: ChecklistItemId,
  })

  const insertTick = SqlSchema.void({
    Request: TickRow,
    execute: (row) =>
      sql`INSERT INTO checklistTicks ${sql.insert(row)} ON CONFLICT DO NOTHING`,
  })

  const deleteTick = SqlSchema.void({
    Request: TickRow,
    execute: ({ scheduleId, itemId }) =>
      sql`
        DELETE FROM checklistTicks
        WHERE scheduleId = ${scheduleId} AND itemId = ${itemId}
      `,
  })

  const findOwnItems = SqlSchema.findAll({
    Request: Schema.Void,
    Result: OwnChecklistItemRow,
    execute: () =>
      sql`
        SELECT id, text, reminderDate, ticked FROM ownChecklistItems
        ORDER BY position
      `,
  })

  const insertOwnItem = SqlSchema.void({
    Request: Schema.Struct({
      id: ChecklistItemId,
      text: Schema.String,
      reminderDate: Schema.NullOr(IsoDate),
    }),
    execute: ({ id, text, reminderDate }) =>
      sql`
        INSERT INTO ownChecklistItems (id, position, text, reminderDate, ticked)
        SELECT ${id}, COALESCE(MAX(position), 0) + 1, ${text}, ${reminderDate}, 0
        FROM ownChecklistItems
      `,
  })

  const updateOwnTick = SqlSchema.findOneOption({
    Request: Schema.Struct({
      id: ChecklistItemId,
      ticked: Schema.BooleanFromBit,
    }),
    Result: Schema.Struct({ id: ChecklistItemId }),
    execute: ({ id, ticked }) =>
      sql`
        UPDATE ownChecklistItems SET ticked = ${ticked} WHERE id = ${id}
        RETURNING id
      `,
  })

  const deleteOwnItem = SqlSchema.void({
    Request: ChecklistItemId,
    execute: (id) => sql`DELETE FROM ownChecklistItems WHERE id = ${id}`,
  })

  const rowsOf = <S extends Schema.Top>(
    Result: S,
    execute: (scheduleId: string) => Statement.Statement<unknown>,
  ) => SqlSchema.findAll({ Request: ScheduleId, Result, execute })

  const findStays = rowsOf(
    StayRow,
    (id) => sql`SELECT * FROM stays WHERE scheduleId = ${id} ORDER BY checkIn`,
  )

  const findDays = rowsOf(
    DayRow,
    (id) => sql`SELECT * FROM days WHERE scheduleId = ${id} ORDER BY date`,
  )

  const findMoves = rowsOf(
    MoveRow,
    (id) => sql`SELECT * FROM moves WHERE scheduleId = ${id} ORDER BY date`,
  )

  const findDayTrips = rowsOf(
    DayTripRow,
    (id) =>
      sql`SELECT * FROM dayTrips WHERE scheduleId = ${id} ORDER BY position`,
  )

  const findVerifyClaims = rowsOf(
    VerifyClaimRow,
    (id) =>
      sql`SELECT * FROM verifyClaims WHERE scheduleId = ${id} ORDER BY position`,
  )

  const findAnchors = rowsOf(
    AnchorRow,
    (id) =>
      sql`SELECT * FROM anchors WHERE scheduleId = ${id} ORDER BY position`,
  )

  const findActivities = rowsOf(
    ActivityRow,
    (id) =>
      sql`SELECT * FROM activities WHERE scheduleId = ${id} ORDER BY date, position`,
  )

  const withoutSchedule = <A extends { readonly scheduleId: string }>(row: A) =>
    Struct.omit(row, ['scheduleId'])

  /** A Schedule's copy, read back from its rows alone. */
  const findCopy = Effect.fnUntraced(function* (scheduleId: ScheduleId) {
    const [stays, days, moves, dayTrips, verifyClaims, anchors, activities] =
      yield* Effect.all([
        findStays(scheduleId),
        findDays(scheduleId),
        findMoves(scheduleId),
        findDayTrips(scheduleId),
        findVerifyClaims(scheduleId),
        findAnchors(scheduleId),
        findActivities(scheduleId),
      ])

    const copy: ScheduleCopy = {
      stays: stays.map(({ note, ...stay }) => ({
        ...withoutSchedule(stay),
        ...(note !== null && { note }),
      })),
      days: days.map(({ date, description, note }) => ({
        date,
        ...(description !== null && { description }),
        ...(note !== null && { note }),
        activities: activities
          .filter((activity) => activity.date === date)
          .map(activityOf),
      })),
      moves: moves.map(({ duration, ...move }) => ({
        ...withoutSchedule(move),
        ...(duration !== null && { duration }),
      })),
      dayTrips: dayTrips.map((row) =>
        Struct.omit(row, ['scheduleId', 'position']),
      ),
      verifyClaims: verifyClaims.map((row) =>
        Struct.omit(row, ['scheduleId', 'position']),
      ),
      anchors: anchors.map((row) => row.anchor),
    }

    return copy
  })

  /** A Schedule found by its own fields, with its copy. */
  const withCopy = <E, R>(
    found: Effect.Effect<Option.Option<ScheduleRecord>, E, R>,
  ) =>
    found.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (schedule) =>
            Effect.map(findCopy(schedule.id), (copy) =>
              Option.some({ schedule, copy }),
            ),
        }),
      ),
    )

  return {
    /** Runs storage operations as one transaction. */
    transaction: sql.withTransaction,

    /** The current Schedule's own fields, if there is one. */
    currentRecord: findCurrent(undefined),

    /** The current Schedule with its copy, if there is one. */
    current: withCopy(findCurrent(undefined)),

    /** A Schedule's own fields, current or archived, if it exists. */
    recordById: findById,

    /** A Schedule with its copy, current or archived, if it exists. */
    scheduleById: (id: ScheduleId) => withCopy(findById(id)),

    /** Every archived Schedule, the most recently archived first. */
    archived: findArchived(undefined),

    /** Archives a Schedule at a moment, given as an ISO 8601 UTC string. */
    archive: (id: ScheduleId, archivedAt: string) =>
      archiveSchedule({ id, archivedAt }),

    /** Makes an archived Schedule current again. */
    makeCurrent: makeScheduleCurrent,

    /** Whether a Schedule has a Day on a date. */
    hasDay: (scheduleId: ScheduleId, date: IsoDate) =>
      Effect.map(findDay({ scheduleId, date }), Option.isSome),

    /** Replaces the Day note on a Day of a Schedule; empty removes it. */
    writeDayNote: (scheduleId: ScheduleId, date: IsoDate, note: string) =>
      updateDayNote({ scheduleId, date, note: storedNote(note) }),

    /** The Activities on a Day of a Schedule, in the order kept. */
    activitiesOn: (scheduleId: ScheduleId, date: IsoDate) =>
      Effect.map(findActivitiesOn({ scheduleId, date }), (rows) =>
        rows.map(activityOf),
      ),

    /** The Day of a Schedule's Activity with an id, if it has one. */
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

    /** Writes the fields an edit changes on a Schedule's Activity. */
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

    /** Removes a Schedule's Activity. */
    removeActivity: (scheduleId: ScheduleId, id: string) =>
      deleteActivity({ scheduleId, id }),

    /** Keeps a Day's Activities in the order of their ids. */
    writeActivityOrder: (scheduleId: ScheduleId, ids: ReadonlyArray<string>) =>
      Effect.forEach(
        ids,
        (id, position) => updateActivityPosition({ scheduleId, id, position }),
        { discard: true },
      ),

    /** Whether a Schedule has a Stay with an id. */
    hasStay: (scheduleId: ScheduleId, stayId: string) =>
      Effect.map(findStay({ scheduleId, stayId }), Option.isSome),

    /** Replaces the Stay note on a Stay of a Schedule; empty removes it. */
    writeStayNote: (scheduleId: ScheduleId, stayId: string, note: string) =>
      updateStayNote({ scheduleId, stayId, note: storedNote(note) }),

    /** The Trip note, if Phillip has written one. */
    tripNote: Effect.map(
      findTripNote(undefined),
      Option.map(({ note }) => note),
    ),

    /** Replaces the Trip note; empty removes it. */
    writeTripNote: (note: string) =>
      note === '' ? deleteTripNote(undefined) : upsertTripNote(note),

    /** The ids of what a Schedule's ticked Checklist items refer to. */
    ticks: (scheduleId: ScheduleId) =>
      Effect.map(
        findTicks(scheduleId),
        (rows): ReadonlySet<string> =>
          new Set(rows.map(({ itemId }) => itemId)),
      ),

    /** Sets the tick on a Schedule's item, by the id of what it refers to. */
    writeTick: (scheduleId: ScheduleId, itemId: string, ticked: boolean) =>
      (ticked ? insertTick : deleteTick)({ scheduleId, itemId }),

    /** Phillip's own Checklist items, in the order he added them. */
    ownItems: findOwnItems(undefined),

    /** Adds one of Phillip's own Checklist items, unticked, after the rest. */
    addOwnItem: (id: string, text: string, reminderDate: IsoDate | null) =>
      insertOwnItem({ id, text, reminderDate }),

    /** Sets the tick on one of Phillip's own items: false when none has the id. */
    writeOwnTick: (id: string, ticked: boolean) =>
      Effect.map(updateOwnTick({ id, ticked }), Option.isSome),

    /** Removes one of Phillip's own items, if it is still there. */
    removeOwnItem: deleteOwnItem,

    /**
     * Stores a new Schedule with its copy, its Activities included, one row
     * per statement to stay well under any limit on bound parameters.
     */
    insert: Effect.fnUntraced(function* (
      schedule: ScheduleRecord,
      copy: ScheduleCopy,
    ) {
      const scheduleId = schedule.id
      yield* insertSchedule(schedule)
      yield* Effect.forEach(
        copy.stays,
        (stay) => insertStay({ ...stay, scheduleId, note: stay.note ?? null }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.days,
        (day) =>
          insertDay({
            scheduleId,
            date: day.date,
            description: day.description ?? null,
            note: day.note ?? null,
          }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.moves,
        (move) =>
          insertMove({
            ...Struct.omit(move, ['duration']),
            scheduleId,
            duration: move.duration ?? null,
          }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.dayTrips,
        (dayTrip, position) =>
          insertDayTrip({ ...dayTrip, scheduleId, position }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.verifyClaims,
        (claim, position) =>
          insertVerifyClaim({ ...claim, scheduleId, position }),
        { discard: true },
      )
      yield* Effect.forEach(
        copy.days.flatMap(({ date, activities }) =>
          activities.map((activity, position) =>
            activityRowOf(scheduleId, date, activity, position),
          ),
        ),
        insertActivity,
        { discard: true },
      )
      yield* Effect.forEach(
        copy.anchors,
        (anchor, position) =>
          insertAnchor({ id: anchor.id, scheduleId, position, anchor }),
        { discard: true },
      )
    }),

    /** The result recorded with an operation id, if it has run. */
    recordedResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.findOneOption({
        Request: OperationId,
        Result: Schema.Struct({ result: Schema.fromJsonString(Result) }),
        execute: (id) => sql`SELECT result FROM operations WHERE id = ${id}`,
      }),

    /** Records an operation id with its result. */
    recordResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.void({
        Request: Schema.Struct({
          id: OperationId,
          result: Schema.fromJsonString(Result),
        }),
        execute: insertInto('operations'),
      }),
  }
})
