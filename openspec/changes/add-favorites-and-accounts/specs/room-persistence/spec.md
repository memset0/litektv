## ADDED Requirements

### Requirement: Account, session, and favorites tables

The backend SHALL create the following SQLite tables on boot (idempotent `CREATE TABLE IF NOT EXISTS`), in addition to the existing `rooms` table:

```
CREATE TABLE accounts (
  account_id    TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  emoji         TEXT NOT NULL DEFAULT '🎤',
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);

CREATE TABLE sessions (
  token        TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);

CREATE TABLE user_links (
  user_id      TEXT PRIMARY KEY,
  account_id   TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  linked_at    INTEGER NOT NULL
);

CREATE TABLE favorites (
  owner_key    TEXT NOT NULL,
  source       TEXT NOT NULL,
  video_id     TEXT NOT NULL,
  page         INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  thumb        TEXT,
  duration     INTEGER,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (owner_key, source, video_id, page)
);

CREATE INDEX IF NOT EXISTS idx_favorites_owner_added ON favorites(owner_key, added_at DESC);
```

WAL journal mode (already enabled for `rooms`) SHALL apply to the whole database.

#### Scenario: Fresh install creates all tables

- **WHEN** the backend starts against an empty `DB_PATH`
- **THEN** all of `rooms`, `accounts`, `sessions`, `user_links`, and `favorites` SHALL exist with the schemas above

#### Scenario: Upgrade keeps existing data

- **WHEN** the backend starts against a database that has only the `rooms` table
- **THEN** the four new tables SHALL be created without modifying or migrating any existing `rooms` row

### Requirement: Favorites are not part of room state

Favorites SHALL be persisted in the `favorites` table only and SHALL NOT appear in the `rooms.state` JSON. Restoring rooms on boot SHALL NOT touch the `favorites` table, and GC of an idle room SHALL NOT delete any favorite rows.

#### Scenario: Idle-room GC leaves favorites intact

- **WHEN** the GC job evicts and `DELETE FROM rooms WHERE slug = ?` for an idle room whose participants had personal favorites
- **THEN** every row in `favorites` for those users' `owner_key`s SHALL remain present and queryable

### Requirement: Anonymous-to-account merge is transactional

The merge of `anon:<userId>` favorites into `acct:<account_id>` (triggered by a successful login or signup from an anonymous connection) SHALL run inside a single SQLite transaction containing the `INSERT OR IGNORE` for each favorite, the `DELETE FROM favorites WHERE owner_key = 'anon:<userId>'`, and the `INSERT OR REPLACE INTO user_links`. If any step fails, the whole transaction SHALL be rolled back.

#### Scenario: Crash during merge

- **WHEN** the process is killed mid-merge after the inserts but before the delete
- **THEN** on restart the database SHALL be in either the pre-merge state or the post-merge state, never a partial state with duplicates under both `owner_key`s

### Requirement: Stored fields remain canonical

Persistence layers SHALL only ever store `source`, `videoId`, `page`, `title`, `thumb`, `duration`, `added_at`, `addedBy` (for room `Song`s) and never the original raw URL or any non-allowlisted query parameter. Code paths that read user-supplied URLs (parser, queue add) SHALL canonicalize before any write.

#### Scenario: Bilibili share URL with tracking params is queued

- **WHEN** a user adds a Bilibili share URL containing `spm_id_from` and `vd_source` to the queue
- **THEN** the resulting `Song` row in `rooms.state` SHALL contain only `{source, videoId, page, title, thumb, duration, addedBy, addedAt, id}` and SHALL NOT contain any of the tracking params or the original URL
