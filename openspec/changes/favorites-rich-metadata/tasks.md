## 1. Schema migration

- [ ] 1.1 In `packages/backend/src/db.ts` `initDb()`, after the existing `CREATE TABLE IF NOT EXISTS favorites (...)`, add a guarded migration block that calls `ALTER TABLE favorites ADD COLUMN display_title TEXT`, `... ADD COLUMN authors TEXT`, `... ADD COLUMN mode TEXT CHECK (mode IS NULL OR mode IN ('instr','vocal'))`, each wrapped to swallow the "duplicate column name" error so it's idempotent on boot
- [ ] 1.2 Update the canonical `CREATE TABLE` literal so a fresh install gets the columns directly (the migration is only for old DBs)

## 2. Backend types and row mapping

- [ ] 2.1 In `packages/backend/src/types.ts`, extend the `Favorite` interface with `displayTitle?: string`, `authors?: string[]`, `mode?: "instr" | "vocal"`
- [ ] 2.2 In `packages/backend/src/db.ts`, extend `FavoriteRow` (the SELECT row shape) with `display_title: string | null`, `authors: string | null`, `mode: string | null`
- [ ] 2.3 Update `rowToFavorite(r)` to surface those fields: `displayTitle` from `r.display_title ?? undefined`, `authors` parsed from `r.authors` (JSON-parse defensively, treat parse failure or non-array as undefined), `mode` from `r.mode` validated against the two literals (anything else → undefined)
- [ ] 2.4 Update the `${FAV_SELECT}` constant to include the three new columns
- [ ] 2.5 `addFavorite()` continues to insert NULL for the three new fields — no API change. Verify the existing INSERT statement's column list does NOT mention them (positional binding stays correct)

## 3. WebSocket favorites snapshot

- [ ] 3.1 Confirm the favorites broadcast path uses `listFavorites()` directly (no other massaging) so the new fields ride along automatically; if any intermediate type/mapper trims them, extend it
- [ ] 3.2 Smoke-test: `node -e` against the live DB, then a curl + ws client confirming the snapshot includes the three new fields on a favorite row whose columns were SQL-set

## 4. Frontend — Favorite shape + render helper

- [ ] 4.1 In `packages/frontend/state.jsx` (or wherever the `Favorite` shape is mirrored client-side), add `displayTitle?`, `authors?`, `mode?` fields
- [ ] 4.2 Create a tiny exported helper in `packages/frontend/app-ui.jsx` (or a new `display.jsx`): `formatSongTitle(song, favoritesByKey)` returning a string. Logic per the spec:
  - Build the favorite key as `\`${song.source}|${song.videoId}|${song.page ?? 0}\``
  - Look up favorite; if absent → return `song.title`
  - If favorite has none of `displayTitle` / non-empty `authors` / `mode` → return `song.title`
  - Otherwise compose: `[mode] · [displayTitle || title] · [authors.join(", ")]`, omitting any segment whose source field is unset (and dropping the adjoining ` · `)
- [ ] 4.3 Export a small `favoritesByKey(favorites)` helper too, so call sites can build the lookup once per render

## 5. Frontend — call sites

- [ ] 5.1 Queue rows (`packages/frontend/app.jsx` queue render path / `app-ui.jsx` `QueueRow`) — replace direct `song.title` with `formatSongTitle(song, favoritesByKey)`
- [ ] 5.2 History rows (`HistoryList` in `app.jsx`) — same swap
- [ ] 5.3 Catalog rows (favorites modal, wherever the parallel session put it) — same swap
- [ ] 5.4 NowPlayingBar (`NowPlayingBar` in `app.jsx`) — same swap
- [ ] 5.5 Any tooltip/title attribute reading `song.title` SHALL also use the helper for consistency

## 6. Verify

- [ ] 6.1 With a fresh `favorites` row (post-migration, no manual metadata): queue/history/catalog/now-playing all render the raw `title` exactly as before
- [ ] 6.2 SQL-set `display_title`, `authors`, `mode` on one row; reload (or wait for next snapshot); confirm every UI surface renders `伴奏 · <displayTitle> · 作者1, 作者2`
- [ ] 6.3 SQL-set only `display_title`; confirm renders `<displayTitle>` (no leading mode segment, no trailing authors segment)
- [ ] 6.4 SQL-set only `mode`; confirm renders `原唱 · <raw title>` (no trailing authors segment)
- [ ] 6.5 SQL-set only `authors`; confirm renders `<raw title> · 作者1, 作者2`
- [ ] 6.6 Verify migration is idempotent: `systemctl restart litektv.service` twice in a row, no errors in `journalctl -u litektv`, `pragma table_info(favorites)` shows exactly the three new columns
- [ ] 6.7 Negative: insert an invalid `mode` value via SQL (e.g. `'remix'`); the UPDATE SHALL fail with a CHECK constraint violation