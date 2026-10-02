// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
// The schema of Phillip's editable data, applied in order by Effect's SQLite
// migrator: in the Durable Object's constructor, and over Node's SQLite in the
// tests. Never edit a migration that has shipped; add the next one.
import { Effect } from 'effect'
import { Migrator, SqlClient } from 'effect/sql'

export const migrations = Migrator.fromRecord({
  '0001_schedules': Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // A Durable Object runs one statement per call.
    yield* sql`
      CREATE TABLE schedules (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('current', 'archived')),
        sourceOptionNumber INTEGER NOT NULL,
        sourceContentVersion TEXT NOT NULL,
        chosenAt TEXT NOT NULL,
        birthdayOutline TEXT NOT NULL
      )
    `
    // Never more than one current Schedule, whatever the code does.
    yield* sql`
      CREATE UNIQUE INDEX schedulesOneCurrent ON schedules (status)
      WHERE status = 'current'
    `
    yield* sql`
      CREATE TABLE stays (
        id TEXT PRIMARY KEY,
        scheduleId TEXT NOT NULL REFERENCES schedules (id),
        base TEXT NOT NULL,
        checkIn TEXT NOT NULL,
        checkOut TEXT NOT NULL,
        accommodation TEXT NOT NULL,
        highlights TEXT NOT NULL
      )
    `
    yield* sql`CREATE INDEX staysBySchedule ON stays (scheduleId, checkIn)`
    yield* sql`
      CREATE TABLE days (
        scheduleId TEXT NOT NULL REFERENCES schedules (id),
        date TEXT NOT NULL,
        description TEXT,
        PRIMARY KEY (scheduleId, date)
      )
    `
    yield* sql`
      CREATE TABLE moves (
        id TEXT PRIMARY KEY,
        scheduleId TEXT NOT NULL REFERENCES schedules (id),
        date TEXT NOT NULL,
        mode TEXT NOT NULL,
        sections TEXT NOT NULL,
        duration TEXT
      )
    `
    yield* sql`CREATE INDEX movesBySchedule ON moves (scheduleId, date)`
    yield* sql`
      CREATE TABLE dayTrips (
        id TEXT PRIMARY KEY,
        scheduleId TEXT NOT NULL REFERENCES schedules (id),
        position INTEGER NOT NULL,
        date TEXT NOT NULL,
        place TEXT NOT NULL,
        optional INTEGER NOT NULL
      )
    `
    yield* sql`CREATE INDEX dayTripsBySchedule ON dayTrips (scheduleId, position)`
    yield* sql`
      CREATE TABLE verifyClaims (
        id TEXT PRIMARY KEY,
        scheduleId TEXT NOT NULL REFERENCES schedules (id),
        position INTEGER NOT NULL,
        text TEXT NOT NULL,
        attachedTo TEXT NOT NULL
      )
    `
    yield* sql`
      CREATE INDEX verifyClaimsBySchedule ON verifyClaims (scheduleId, position)
    `
    yield* sql`
      CREATE TABLE anchors (
        id TEXT PRIMARY KEY,
        scheduleId TEXT NOT NULL REFERENCES schedules (id),
        position INTEGER NOT NULL,
        anchor TEXT NOT NULL
      )
    `
    yield* sql`CREATE INDEX anchorsBySchedule ON anchors (scheduleId, position)`
    // Each write's client-generated id with its result.
    yield* sql`
      CREATE TABLE operations (
        id TEXT PRIMARY KEY,
        result TEXT NOT NULL
      )
    `
  }),
  // When each Schedule was last archived; null while it is current.
  '0002_schedules_archived_at': Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`ALTER TABLE schedules ADD COLUMN archivedAt TEXT`
  }),
})
