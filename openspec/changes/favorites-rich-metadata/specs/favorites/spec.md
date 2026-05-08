## ADDED Requirements

### Requirement: Optional manual metadata on favorites

Each favorite row SHALL carry three optional manual-metadata fields, in addition to the existing canonical fields:

- `displayTitle` (string, optional): the user's canonical song name. Convention: simplified Chinese for any CN segments, English left as-is. The raw `title` is preserved on the row as the imported original.
- `authors` (string[], optional): one or more credited people. When present the array SHALL contain ≥1 entry; an empty array MUST NOT be stored.
- `mode` (`"instr"` | `"vocal"`, optional): `"instr"` = 伴奏, `"vocal"` = 原唱. Any other value MUST be rejected by the persistence layer (DB-level CHECK constraint).

All three fields default to absent for newly-added favorites.

#### Scenario: Newly-added favorite has no manual metadata

- **WHEN** any client sends `favorite.add` for a new song
- **THEN** the persisted row SHALL have `displayTitle`, `authors`, `mode` all absent (NULL in storage), and the broadcast `favorites` snapshot SHALL reflect that absence

### Requirement: favorite.update applies a partial patch

The backend SHALL accept `{type:"favorite.update", source, videoId, page, displayTitle?, authors?, mode?}` from any connected client. Fields not present in the message SHALL NOT be touched on the row; fields present with `null` SHALL clear that column. After a successful update the server SHALL broadcast `{type:"favorites", favorites:Favorite[]}` site-wide (same broadcast path used by `favorite.add`).

The update SHALL share the existing `favorite.add` rate-limit bucket (60/min per `userId`); exceeding the budget SHALL return `{type:"error", error:"rate limited (favorite)"}` and SHALL NOT mutate state.

If `(source, videoId, page)` doesn't match an existing row the server SHALL respond with `{type:"error", error:"unknown favorite"}` and SHALL NOT mutate state.

#### Scenario: Set displayTitle and authors but not mode

- **WHEN** a client sends `{type:"favorite.update", source, videoId, page, displayTitle:"小镇姑娘", authors:["陶喆"]}`
- **THEN** the row SHALL have `display_title='小镇姑娘'`, `authors='["陶喆"]'`, and `mode` SHALL retain whatever value it had before (including NULL)

#### Scenario: Clear authors with explicit null

- **WHEN** a client sends `{type:"favorite.update", source, videoId, page, authors:null}`
- **THEN** the row's `authors` column SHALL be set to NULL; `display_title` and `mode` SHALL be unchanged

#### Scenario: Bad mode value is rejected

- **WHEN** a client sends `{type:"favorite.update", source, videoId, page, mode:"remix"}`
- **THEN** the server SHALL respond with `{type:"error", error:"bad mode"}` and SHALL NOT mutate state

### Requirement: favorite.remove deletes the row

The backend SHALL accept `{type:"favorite.remove", source, videoId, page}` and SHALL delete the matching row from `favorites` (subject to the same rate-limit bucket as `favorite.add`). After a successful remove the server SHALL broadcast `favorites` site-wide. If `(source, videoId, page)` doesn't match an existing row the server SHALL respond `{type:"error", error:"unknown favorite"}` (idempotent at the operation level — no error if you remove twice would mask a genuine "doesn't exist", so we surface it).

#### Scenario: Catalog delete

- **WHEN** the user clicks the trash icon on a catalog row, confirms, and the client sends `{type:"favorite.remove", source, videoId, page}`
- **THEN** the row SHALL be deleted, every connected client SHALL receive a `favorites` snapshot without that entry, and the catalog modal SHALL re-render without it

### Requirement: Structured-title display only when all three manual fields are set

The frontend SHALL provide a single helper, used by every UI site that renders a song title (queue rows, history rows, catalog rows, now-playing bar), that decides between the structured form and the raw title for a given song.

The structured form SHALL be used **only when** the song's `(source, videoId, page)` is present in the global favorites snapshot AND that favorite row has **all three** of `displayTitle` (non-empty string), `authors` (array with ≥1 entry), and `mode` (`"instr"` or `"vocal"`) populated. If any one of the three is missing — or the song is not favorited — the helper SHALL return the raw `song.title` unchanged.

The structured form SHALL be:

`[伴奏|原唱] · [displayTitle] · [作者1, 作者2, ...]`

with `mode="instr"` rendered as `伴奏`, `mode="vocal"` as `原唱`, and `authors` joined by `, `.

The helper SHALL NOT mutate the underlying `Song` or `Favorite` records.

#### Scenario: All three fields populated

- **WHEN** a favorite has `displayTitle="小镇姑娘"`, `authors=["陶喆"]`, `mode="instr"`
- **THEN** every UI site rendering this song SHALL show `伴奏 · 小镇姑娘 · 陶喆`

#### Scenario: One field missing falls back to raw title

- **WHEN** a favorite has `displayTitle="小镇姑娘"` and `authors=["陶喆"]` but `mode` is absent
- **THEN** the rendered title SHALL equal `song.title` exactly — NOT a partial structured form

#### Scenario: Non-favorited song uses raw title

- **WHEN** a song's `(source, videoId, page)` is NOT in the favorites snapshot
- **THEN** the rendered title SHALL equal `song.title` exactly

### Requirement: Star button — click filled ★ opens the edit modal

When a queue row's or history row's ★ button is **filled** (the song is already in favorites), clicking it SHALL open the same edit modal that the catalog row's edit button opens, pre-populated with the matching favorite's current `displayTitle` / `authors` / `mode`. The button SHALL NOT be `disabled`. Empty ★ behavior is unchanged: clicking sends `favorite.add`.

#### Scenario: Click filled ★ on a history row

- **WHEN** the user clicks a filled ★ on a history row
- **THEN** the edit modal SHALL open with that favorite's current three fields, NOT a `favorite.add` message

#### Scenario: Click empty ★ on a queue row

- **WHEN** the user clicks an empty ★ on a queue row
- **THEN** the client SHALL send `favorite.add` (existing behavior unchanged)

### Requirement: Server preserves manual metadata across favorite.add retries

If a row already exists in `favorites` with manual metadata populated, a subsequent `favorite.add` for the same `(source, videoId, page)` SHALL be a no-op for the manual fields — `displayTitle`, `authors`, `mode` SHALL be preserved exactly (consistent with the existing "first starrer wins" rule).

#### Scenario: Re-favorite does not clobber manual edits

- **WHEN** the operator has set a row's `display_title` / `authors` / `mode`, and a different user later sends `favorite.add` for that same key
- **THEN** the row's manual fields SHALL be unchanged; only the broadcast `favorites` snapshot is re-sent

### Requirement: Audit log records every successful favorite mutation

Every successful `favorite.add`, `favorite.update`, and `favorite.remove` SHALL append exactly one row to a `favorite_audit` table capturing `(ts, op, source, video_id, page, user_id, user_name, user_emoji, before_json, after_json)`:

- `ts` — server-side `Date.now()` at the moment of the mutation.
- `op` — `'add'`, `'update'`, or `'remove'`.
- `before_json` — the full row state before the operation as a JSON object string, or NULL for `'add'`.
- `after_json` — the full row state after the operation as a JSON object string, or NULL for `'remove'`.
- `user_id` / `user_name` / `user_emoji` — the actor's presence info; the server SHALL stamp these from the connection's known identity (NOT trust the client to set them).

Failed mutations (rate-limited, validation errors, unknown favorite) MUST NOT log. The audit table is append-only — there SHALL be no `DELETE FROM favorite_audit` code path in production (only the rollback CLI tool may rewrite history, and even it SHALL preserve audit rows; see below).

#### Scenario: Update logs before+after

- **WHEN** a client sends `favorite.update` setting `displayTitle="小镇姑娘"` on a row that previously had `displayTitle=NULL, authors=NULL, mode=NULL`
- **THEN** a `favorite_audit` row SHALL be inserted with `op='update'`, `before_json` containing the previous full row, and `after_json` containing the row with the new `displayTitle` populated

#### Scenario: Failed update does not log

- **WHEN** a client sends `favorite.update` with `mode="remix"` (invalid)
- **THEN** the server returns the validation error AND SHALL NOT insert any `favorite_audit` row

### Requirement: Rollback is CLI-only

The audit log enables a point-in-time rollback of the `favorites` table. The rollback tool SHALL be invoked exclusively from the local shell (e.g. `pnpm --dir packages/backend tsx src/rollbackFavorites.ts <ISO-timestamp>`); it SHALL replay/skip audit rows to compute what each `(source, video_id, page)` looked like at the target timestamp, and SHALL rewrite the `favorites` table to match in one SQLite transaction.

There SHALL be NO HTTP / WebSocket / frontend route that can trigger a rollback. Any future "expose rollback" idea is explicitly out-of-scope and would be a separate change.

The CLI tool SHALL print a dry-run diff (rows added / changed / removed) by default and SHALL only commit when invoked with an explicit `--apply` flag. Each rollback execution SHALL itself append a single `favorite_audit` row with `op='rollback'`, `before_json` containing a snapshot of the table before the rollback and `after_json` containing a snapshot after, so subsequent rollbacks remain auditable.

#### Scenario: Rollback dry-run

- **WHEN** the operator runs `pnpm --dir packages/backend tsx src/rollbackFavorites.ts 2026-05-08T08:00:00Z` (no `--apply`)
- **THEN** the script SHALL print the diff (e.g. `+ 3 rows`, `~ 1 row updated`, `- 2 rows`) and exit without modifying `favorites`

#### Scenario: Rollback apply

- **WHEN** the operator re-runs the same command with `--apply`
- **THEN** the script SHALL execute the diff inside a transaction; after the script exits, the `favorites` table SHALL match what it looked like at the target timestamp; one `op='rollback'` row SHALL appear in `favorite_audit` with the before/after snapshots

#### Scenario: No HTTP / WS path can trigger rollback

- **WHEN** any client sends `{type:"favorite.rollback", ...}` or any HTTP request to `/api/favorites/rollback` (or any URL the operator might invent)
- **THEN** the server SHALL respond exactly as it would for any other unknown message / 404 — there is no rollback handler reachable over the network
