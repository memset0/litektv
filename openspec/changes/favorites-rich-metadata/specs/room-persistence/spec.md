## MODIFIED Requirements

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
  display_title  TEXT,
  authors        TEXT,
  mode           TEXT CHECK (mode IS NULL OR mode IN ('instr', 'vocal')),
  PRIMARY KEY (source, video_id, page)
);

CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);
```

The three new columns (`display_title`, `authors`, `mode`) are nullable manual-metadata fields owned by the operator (or by `favorite.update` over WebSocket); see the `favorites` capability for their semantics. `authors` stores a JSON array of strings as text. `mode` is constrained to `'instr'` (伴奏) or `'vocal'` (原唱), or NULL when unspecified.

For installs whose existing `favorites` table predates these columns, the backend SHALL run an idempotent migration on boot that adds each missing column via `ALTER TABLE favorites ADD COLUMN ...`, guarded so that if the column already exists the boot continues without error. The migration SHALL NOT modify existing row content — old rows simply read back as `NULL` for the three new fields.

The table is GLOBAL — there is no `owner_key` column and no per-user scoping. WAL journal mode (already enabled for `rooms`) SHALL apply to the whole database.

#### Scenario: Fresh install creates the favorites table with the new columns

- **WHEN** the backend starts against an empty `DB_PATH`
- **THEN** the `favorites` table SHALL exist with the schema above, including `display_title`, `authors`, `mode`

#### Scenario: Upgrade adds the three new columns idempotently

- **WHEN** the backend starts against a database whose `favorites` table predates this change (no `display_title` / `authors` / `mode` columns)
- **THEN** the boot migration SHALL add the three columns via `ALTER TABLE`, leave existing row content untouched (those rows now read back `NULL` for the three new fields), and a second restart SHALL be a no-op (no errors, no duplicate columns)

## ADDED Requirements

### Requirement: Favorite audit log table

The backend SHALL create the following SQLite table on boot (idempotent `CREATE TABLE IF NOT EXISTS`):

```
CREATE TABLE favorite_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('add', 'update', 'remove', 'rollback')),
  source      TEXT,
  video_id    TEXT,
  page        INTEGER,
  user_id     TEXT,
  user_name   TEXT,
  user_emoji  TEXT,
  before_json TEXT,
  after_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_favorite_audit_ts ON favorite_audit(ts);
CREATE INDEX IF NOT EXISTS idx_favorite_audit_key ON favorite_audit(source, video_id, page, ts);
```

`op='rollback'` rows have `(source, video_id, page)` NULL; `before_json` / `after_json` contain whole-table snapshots for those rows. For `add` / `update` / `remove` the three identity columns are mandatory.

The table is append-only — no production code path SHALL `DELETE` or `UPDATE` rows here. The CLI rollback tool SHALL append its own audit row (op='rollback') without touching prior rows.

#### Scenario: Mutation appends an audit row

- **WHEN** any successful `favorite.add` / `favorite.update` / `favorite.remove` lands
- **THEN** exactly one row SHALL be appended to `favorite_audit` with the matching `op`, the actor's identity, and `before_json` / `after_json` populated per the `favorites` capability spec

#### Scenario: Failed mutation does not append

- **WHEN** a `favorite.update` is rejected (rate-limited, bad mode, unknown favorite)
- **THEN** no row SHALL be appended to `favorite_audit`

### Requirement: Stored fields remain canonical

Persistence layers SHALL only ever store `source`, `videoId`, `page`, `title`, `thumb`, `duration`, `added_by_*`, `added_at`, `display_title`, `authors`, `mode` (for favorites) and the existing canonical `Song` fields (for room state). Manual-metadata writes SHALL go through the `favorite.update` handler (or the rollback CLI), both of which validate `mode` and parse `authors` as a JSON string array before persisting. Code paths that read user-supplied URLs (parser, queue add) SHALL canonicalize before any write.

#### Scenario: Tracking params never make it into favorites or audit

- **WHEN** a Bilibili share URL with `spm_id_from`, `vd_source` is parsed and queued, then later starred
- **THEN** neither the resulting `favorites` row NOR any `favorite_audit` row SHALL contain those query params
