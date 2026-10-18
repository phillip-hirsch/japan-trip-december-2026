// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
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
  Hotel,
  IsoDate,
  IsoInstant,
  Move,
  OperationId,
  Pin,
  ScheduleAnchor,
  ScheduleId,
  ScheduleRecord,
  Stay,
  TokyoDateTime,
  VerifyClaim,
  VerifyClaimAttachment,
} from '@/trip/domain'
import type { Activity, HotelDetails } from '@/trip/domain'
import type { ScheduleCopy, StayEditPlan } from '@/trip/schedule-plan'

type StayChanges = Pick<ScheduleCopy, 'stays' | 'moves' | 'verifyClaims'>

const ofSchedule = { scheduleId: ScheduleId }

const ordered = { position: Schema.Int }

const storedNote = (note: string) => (note === '' ? null : note)

const PinColumns = Schema.Struct({
  pinLatitude: Schema.NullOr(Schema.Finite),
  pinLongitude: Schema.NullOr(Schema.Finite),
  pinLink: Schema.NullOr(Schema.String),
})

type PinColumns = typeof PinColumns.Type

const pinColumnsOf = (pin: Pin | undefined): PinColumns => ({
  pinLatitude: pin?.coordinates.latitude ?? null,
  pinLongitude: pin?.coordinates.longitude ?? null,
  pinLink: pin?.link ?? null,
})

const pinOf = ({
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

const StayRow = Schema.Struct({
  id: CopyId,
  ...ofSchedule,
  ...Stay.fields,
  highlights: Schema.fromJsonString(Stay.fields.highlights),
  note: Schema.NullOr(Schema.String),
  hotelName: Schema.NullOr(Schema.String),
  hotelAddress: Schema.NullOr(Schema.String),
  hotelConfirmationNumber: Schema.NullOr(Schema.String),
  ...PinColumns.fields,
})

const hotelColumns = [
  'hotelName',
  'hotelAddress',
  'hotelConfirmationNumber',
  'pinLatitude',
  'pinLongitude',
  'pinLink',
] as const

const hotelColumnsOf = (details: HotelDetails) => ({
  hotelName: details.name ?? null,
  hotelAddress: details.address ?? null,
  hotelConfirmationNumber: details.confirmationNumber ?? null,
})

const hotelOf = ({
  hotelName,
  hotelAddress,
  hotelConfirmationNumber,
  ...pinColumns
}: ReturnType<typeof hotelColumnsOf> & PinColumns): Hotel => {
  const pin = pinOf(pinColumns)

  return hotelName === null &&
    hotelAddress === null &&
    hotelConfirmationNumber === null &&
    pin === undefined
    ? Hotel.cases.NotRecorded.make({})
    : Hotel.cases.Recorded.make({
        ...(hotelName !== null && { name: hotelName }),
        ...(hotelAddress !== null && { address: hotelAddress }),
        ...(hotelConfirmationNumber !== null && {
          confirmationNumber: hotelConfirmationNumber,
        }),
        ...(pin && { pin }),
      })
}

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
  time: Schema.NullOr(TokyoDateTime),
  note: Schema.NullOr(Schema.String),
  ...PinColumns.fields,
})

const activityOf = ({
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

const activityRowOf = (
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

const OwnChecklistItemRow = Schema.Struct({
  id: ChecklistItemId,
  text: Schema.String,
  reminderDate: Schema.NullOr(IsoDate),
  ticked: Schema.BooleanFromBit,
})

export type OwnChecklistItem = typeof OwnChecklistItemRow.Type

export type ScheduleStore = Effect.Success<typeof scheduleStore>

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
  const insertDay = inserter('days', DayRow)
  const insertDayTrip = inserter('dayTrips', DayTripRow)
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
    Request: Schema.Struct({ id: ScheduleId, archivedAt: IsoInstant }),
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

  const updateHotelDetails = SqlSchema.void({
    Request: Schema.Struct({
      scheduleId: ScheduleId,
      stayId: CopyId,
      hotelName: Schema.NullOr(Schema.String),
      hotelAddress: Schema.NullOr(Schema.String),
      hotelConfirmationNumber: Schema.NullOr(Schema.String),
    }),
    execute: ({ scheduleId, stayId, ...columns }) =>
      sql`
        UPDATE stays SET ${sql.update(columns)}
        WHERE scheduleId = ${scheduleId} AND id = ${stayId}
      `,
  })

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
      stays: stays.map(({ note, ...row }) => ({
        ...withoutSchedule(Struct.omit(row, hotelColumns)),
        ...(note !== null && { note }),
        hotel: hotelOf(row),
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

  const upsertInto = (table: string) => (row: Schema.JsonObject) =>
    sql`
      INSERT INTO ${sql(table)} ${sql.insert(row)}
      ON CONFLICT (id) DO UPDATE SET ${sql.update(row, ['id', 'scheduleId'])}
      WHERE ${sql(table)}.scheduleId = excluded.scheduleId
    `

  const stayChangeWriters = (
    write: (
      table: string,
    ) => (row: Schema.JsonObject) => Statement.Statement<unknown>,
  ) => ({
    stay: SqlSchema.void({ Request: StayRow, execute: write('stays') }),
    move: SqlSchema.void({ Request: MoveRow, execute: write('moves') }),
    verifyClaim: SqlSchema.void({
      Request: VerifyClaimRow,
      execute: write('verifyClaims'),
    }),
  })

  const inserting = stayChangeWriters(insertInto)

  const upserting = stayChangeWriters(upsertInto)

  const writeStayChanges = Effect.fnUntraced(function* (
    scheduleId: ScheduleId,
    { stays, moves, verifyClaims }: StayChanges,
    writers: ReturnType<typeof stayChangeWriters>,
  ) {
    yield* Effect.forEach(
      stays,
      ({ hotel, ...stay }) =>
        writers.stay({
          ...stay,
          scheduleId,
          note: stay.note ?? null,
          ...hotelColumnsOf(Hotel.guards.Recorded(hotel) ? hotel : {}),
          ...pinColumnsOf(Hotel.guards.Recorded(hotel) ? hotel.pin : undefined),
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      moves,
      (move) =>
        writers.move({
          ...Struct.omit(move, ['duration']),
          scheduleId,
          duration: move.duration ?? null,
        }),
      { discard: true },
    )
    yield* Effect.forEach(
      verifyClaims,
      (claim, position) =>
        writers.verifyClaim({ ...claim, scheduleId, position }),
      { discard: true },
    )
  })

  const deleteFrom = (
    table: string,
    column: string,
    scheduleId: ScheduleId,
    ids: ReadonlyArray<string>,
  ) =>
    ids.length === 0
      ? Effect.void
      : sql`
          DELETE FROM ${sql(table)}
          WHERE scheduleId = ${scheduleId} AND ${sql.in(column, ids)}
        `

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
    transaction: sql.withTransaction,

    currentRecord: findCurrent(undefined),

    current: withCopy(findCurrent(undefined)),

    recordById: findById,

    scheduleById: (id: ScheduleId) => withCopy(findById(id)),

    /** Every archived Schedule, the most recently archived first. */
    archived: findArchived(undefined),

    archive: (id: ScheduleId, archivedAt: IsoInstant) =>
      archiveSchedule({ id, archivedAt }),

    makeCurrent: makeScheduleCurrent,

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

    hasStay: (scheduleId: ScheduleId, stayId: string) =>
      Effect.map(findStay({ scheduleId, stayId }), Option.isSome),

    /** Replaces the Stay note on a Stay of a Schedule; empty removes it. */
    writeStayNote: (scheduleId: ScheduleId, stayId: string, note: string) =>
      updateStayNote({ scheduleId, stayId, note: storedNote(note) }),

    /**
     * Replaces the Hotel details on a Stay of a Schedule; a field absent
     * removes it.
     */
    writeHotelDetails: (
      scheduleId: ScheduleId,
      stayId: string,
      details: HotelDetails,
    ) => updateHotelDetails({ scheduleId, stayId, ...hotelColumnsOf(details) }),

    /** Replaces the Pin on a Schedule's Activity; none removes it. */
    writeActivityPin: (scheduleId: ScheduleId, id: string, pin?: Pin) =>
      updateActivityPin({ scheduleId, id, ...pinColumnsOf(pin) }),

    /** Replaces the Pin on a Stay's hotel; none removes it. */
    writeHotelPin: (scheduleId: ScheduleId, stayId: string, pin?: Pin) =>
      updateHotelPin({ scheduleId, id: stayId, ...pinColumnsOf(pin) }),

    tripNote: Effect.map(
      findTripNote(undefined),
      Option.map(({ note }) => note),
    ),

    /** Replaces the Trip note; empty removes it. */
    writeTripNote: (note: string) =>
      note === '' ? deleteTripNote(undefined) : upsertTripNote(note),

    ticks: (scheduleId: ScheduleId) =>
      Effect.map(
        findTicks(scheduleId),
        (rows): ReadonlySet<string> =>
          new Set(rows.map(({ itemId }) => itemId)),
      ),

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
      yield* writeStayChanges(scheduleId, copy, inserting)
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
        copy.dayTrips,
        (dayTrip, position) =>
          insertDayTrip({ ...dayTrip, scheduleId, position }),
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

    /**
     * Saves an applied Stay edit: deletes the Stays, Moves, Verify claims and
     * Ticks it drops, then writes the ones it keeps.
     */
    saveStayEdit: Effect.fnUntraced(function* (
      scheduleId: ScheduleId,
      { dropped, ...kept }: StayEditPlan,
    ) {
      yield* deleteFrom('checklistTicks', 'itemId', scheduleId, dropped.ticks)
      yield* deleteFrom('stays', 'id', scheduleId, dropped.stays)
      yield* deleteFrom('moves', 'id', scheduleId, dropped.moves)
      yield* deleteFrom('verifyClaims', 'id', scheduleId, dropped.verifyClaims)
      yield* writeStayChanges(scheduleId, kept, upserting)
    }),

    recordedResult: <S extends Schema.Top>(Result: S) =>
      SqlSchema.findOneOption({
        Request: OperationId,
        Result: Schema.Struct({ result: Schema.fromJsonString(Result) }),
        execute: (id) => sql`SELECT result FROM operations WHERE id = ${id}`,
      }),

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
