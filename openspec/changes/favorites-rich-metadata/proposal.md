## Why

Today the favorites table only carries the song's raw imported `title`. In practice the user keeps a mix of 伴奏 (instrumental) and 原唱 (original-vocal) tracks, often pulled from sources where the title is messy, traditional/simplified Chinese mixed, or doesn't even credit the singers. The user wants:

- A clean **canonical song name** (simplified Chinese for CN parts, English unchanged) separate from the raw imported title — so re-queueing a song shows the polished name even if the upstream title was junk.
- An **author list** because most songs have multiple credited people (singer + composer + lyricist), and they should be displayed comma-separated.
- A **mode flag** marking the row as 伴奏 / 原唱 so the catalog can surface that at a glance.

The user explicitly wants to populate these fields by editing the SQLite database directly (no edit UI in v1). Once they're set, the frontend must render the structured form everywhere a favorited song's title appears (queue rows, history rows, catalog rows, now-playing bar).

## What Changes

- **Schema** (additive, backwards-compatible): three new nullable columns on `favorites`:
  - `display_title TEXT` — the user's canonical name; null = use the raw `title`.
  - `authors TEXT` — JSON array of strings (e.g. `["陶喆","蔡依林"]`) stored as text; null = unknown authors.
  - `mode TEXT CHECK (mode IS NULL OR mode IN ('instr','vocal'))` — `instr` = 伴奏, `vocal` = 原唱, null = unspecified.
- **Migration**: idempotent `ALTER TABLE favorites ADD COLUMN ...` for each, guarded so existing installs auto-upgrade on the next service restart.
- **Backend**: `Favorite` type and the `favorites` snapshot SHALL include these three new fields. `addFavorite` keeps writing `null` for the three new fields (no `favorite.add` payload change). The user populates them by direct SQL.
- **Frontend display logic** (new helper, applied wherever a song title is rendered):
  - If the song is in the favorites snapshot AND that favorite has any of (`displayTitle` ∨ `authors` ∨ `mode`) populated → render the **structured form**:
    `[伴奏/原唱] · [曲名] · [作者1, 作者2]`
    - `[伴奏/原唱]` segment is included only if `mode` is set; otherwise omitted (and the leading `·` skipped).
    - `[曲名]` is `displayTitle` if set, else the raw `title`.
    - `[作者1, 作者2]` is included only if `authors` is non-empty; otherwise omitted (and the trailing `·` skipped).
  - Otherwise → render the raw `title` exactly as today (unchanged behavior for non-favorited songs and for favorites with no manual metadata).
- **No edit UI in v1.** No `favorite.update` WebSocket message either; the structure is explicitly marked "may change later".

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `favorites`: each favorite row gains three optional manual-metadata fields (`displayTitle`, `authors`, `mode`); the rendering rule for favorited songs becomes "structured if any manual field is set, else raw title".
- `room-persistence`: the `favorites` table schema gains three new nullable columns (additive ALTER); existing rows continue to read back as `null` for all three.

## Impact

- Affected code:
  - `packages/backend/src/db.ts` — schema migration + `Favorite` row mapping.
  - `packages/backend/src/types.ts` — `Favorite` interface gains optional fields.
  - `packages/backend/src/ws.ts` (or wherever favorites snapshot is built) — pass the new fields through.
  - `packages/frontend/state.jsx` — `Favorite` shape mirrored to include the three new fields.
  - `packages/frontend/app-ui.jsx` (or a new `display.jsx` helper) — `formatFavoritedTitle(song, favoritesByKey)` that returns either the structured string or the raw title.
  - Every JSX site that renders a song title (queue rows, history rows, catalog rows, now-playing bar) — call the helper instead of `song.title` directly.
- Affected data: existing `favorites` rows in the live `litektv.db` get three new `NULL` columns added by the migration. No row content is rewritten; the user populates manually.
- Backwards compatibility: a favorite with no manual metadata renders identically to today (raw title); a non-favorited song renders identically to today. Only favorites whose new fields are populated change visually.
