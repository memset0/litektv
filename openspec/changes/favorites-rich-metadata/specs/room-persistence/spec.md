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

The three new columns (`display_title`, `authors`, `mode`) are nullable manual-metadata fields owned by the operator (populated by direct SQL); see the `favorites` capability for their semantics. `authors` stores a JSON array of strings as text. `mode` is constrained to `'instr'` (伴奏) or `'vocal'` (原唱), or NULL when unspecified.

For installs whose existing `favorites` table predates these columns, the backend SHALL run an idempotent migration on boot that adds each missing column via `ALTER TABLE favorites ADD COLUMN ...`, guarded so that if the column already exists the boot continues without error. The migration SHALL NOT modify existing row content — old rows simply read back as `NULL` for the three new fields.

The table is GLOBAL — there is no `owner_key` column and no per-user scoping. WAL journal mode (already enabled for `rooms`) SHALL apply to the whole database.

#### Scenario: Fresh install creates the favorites table with the new columns

- **WHEN** the backend starts against an empty `DB_PATH`
- **THEN** the `favorites` table SHALL exist with the schema above, including `display_title`, `authors`, `mode`

#### Scenario: Upgrade adds the three new columns idempotently

- **WHEN** the backend starts against a database whose `favorites` table predates this change (no `display_title` / `authors` / `mode` columns)
- **THEN** the boot migration SHALL add the three columns via `ALTER TABLE`, leave existing row content untouched (those rows now read back `NULL` for the three new fields), and a second restart SHALL be a no-op (no errors, no duplicate columns)

#### Scenario: Operator populates manual metadata via direct SQL

- **WHEN** the operator runs `UPDATE favorites SET display_title=?, authors=?, mode=? WHERE source=? AND video_id=? AND page=?` on a live database
- **THEN** the row SHALL accept the update (subject to the `mode` CHECK constraint), persist on the next checkpoint, and SHALL appear in the next `favorites` snapshot delivered to any connecting client
