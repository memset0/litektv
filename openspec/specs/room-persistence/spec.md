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
