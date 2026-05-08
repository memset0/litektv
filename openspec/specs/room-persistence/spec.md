# Room Persistence

## Purpose

Room state survives backend restarts and is the canonical durable record. SQLite is the storage engine; each room is a single row keyed by slug.
## Requirements
### Requirement: SQLite-backed room store

The backend SHALL persist `RoomState` to a SQLite database via `better-sqlite3`. The schema SHALL store one row per room with the full state serialized as JSON:

```
CREATE TABLE rooms (
  slug          TEXT PRIMARY KEY,
  state         TEXT NOT NULL,         -- JSON of RoomState
  last_activity INTEGER NOT NULL
);
```

WAL journal mode SHALL be enabled for concurrent reads.

#### Scenario: Mutation writes through to disk

- **WHEN** any room mutation increments `state.rev` (via the `bump()` path)
- **THEN** the corresponding row in `rooms` SHALL be upserted with the new JSON state and `last_activity = now`

#### Scenario: Persistence is best-effort, never blocking

- **WHEN** a write to SQLite throws an error
- **THEN** the mutation SHALL still complete and the broadcast to subscribers SHALL still happen (the failure is swallowed; persistence is not a hard dependency for live operation)

### Requirement: Hydrate in-memory rooms on startup

On boot, the backend SHALL read every row from `rooms` and rebuild the in-memory map BEFORE accepting WebSocket connections.

#### Scenario: Restart preserves queues

- **WHEN** the systemd service restarts and a previously-active room had non-empty queue, history, and danmaku
- **THEN** the first client to reconnect SHALL receive a `state` snapshot identical to the pre-restart state (modulo `users[*].lastSeen` becoming stale)

### Requirement: Idle-room garbage collection

A room SHALL be evicted from memory and deleted from the DB when it has had no subscribers AND no activity for `ROOM_TTL_MS` (default 24h).

#### Scenario: Idle room is GC'd

- **WHEN** `lastActivity < now - ROOM_TTL_MS` and `subscribers.size === 0`
- **THEN** the next GC tick SHALL remove the room from memory AND `DELETE FROM rooms WHERE slug = ?`

### Requirement: Configurable DB path

The backend SHALL read `DB_PATH` from the environment, defaulting to `./data/litektv.db` relative to the working directory. The directory SHALL be created if it doesn't exist.

#### Scenario: Production DB path lives outside packages/

- **WHEN** the systemd unit sets `DB_PATH=/root/yulun/litektv/backend/data/litektv.db`
- **THEN** the database file SHALL be written at that absolute path (kept intentionally outside `packages/` so the build artifact tree stays clean)

### Requirement: Favorites table

The backend SHALL create the following SQLite table on boot (idempotent `CREATE TABLE IF NOT EXISTS`), in addition to the existing `rooms` table:

```
CREATE TABLE favorites (
  source         TEXT NOT NULL,
  video_id       TEXT NOT NULL,
  page           INTEGER NOT NULL DEFAULT 0,
  title          TEXT NOT NULL,
  thumb          TEXT,
  duration       INTEGER,
  added_by_id    TEXT,
  added_by_name  TEXT,
  added_by_emoji TEXT,
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (source, video_id, page)
);

CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);
```

The table is GLOBAL — there is no `owner_key` column and no per-user scoping. WAL journal mode (already enabled for `rooms`) SHALL apply to the whole database.

#### Scenario: Fresh install creates the favorites table

- **WHEN** the backend starts against an empty `DB_PATH`
- **THEN** both `rooms` and `favorites` SHALL exist with the schemas above

#### Scenario: Upgrade keeps existing data

- **WHEN** the backend starts against a database that has only the `rooms` table
- **THEN** the `favorites` table SHALL be created without modifying or migrating any existing `rooms` row

### Requirement: Favorites are not part of room state

Favorites SHALL be persisted in the `favorites` table only and SHALL NOT appear in the `rooms.state` JSON. Restoring rooms on boot SHALL NOT touch the `favorites` table, and GC of an idle room SHALL NOT delete any favorite rows. Because favorites are global, they outlive every room.

#### Scenario: Idle-room GC leaves favorites intact

- **WHEN** the GC job evicts a room and runs `DELETE FROM rooms WHERE slug = ?`
- **THEN** every row in `favorites` SHALL remain present and queryable, regardless of which user originally starred them

### Requirement: Stored fields remain canonical

Persistence layers SHALL only ever store `source`, `videoId`, `page`, `title`, `thumb`, `duration`, `added_by_*`, `added_at` (for favorites) and `addedBy` (for room `Song`s) — never the original raw URL or any non-allowlisted query parameter. Code paths that read user-supplied URLs (parser, queue add) SHALL canonicalize before any write.

#### Scenario: Bilibili share URL with tracking params is queued

- **WHEN** a user adds a Bilibili share URL containing `spm_id_from` and `vd_source` to the queue
- **THEN** the resulting `Song` row in `rooms.state` SHALL contain only `{source, videoId, page, title, thumb, duration, addedBy, addedAt, id}` and SHALL NOT contain any of the tracking params or the original URL

