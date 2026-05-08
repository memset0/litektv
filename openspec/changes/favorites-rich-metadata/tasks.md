## 1. Schema migration

- [ ] 1.1 In `packages/backend/src/db.ts` `initDb()`, after the existing `CREATE TABLE IF NOT EXISTS favorites (...)`, add a guarded migration block that calls `ALTER TABLE favorites ADD COLUMN display_title TEXT`, `... authors TEXT`, `... mode TEXT CHECK (mode IS NULL OR mode IN ('instr','vocal'))`, each wrapped to swallow the "duplicate column name" error so it's idempotent on boot
- [ ] 1.2 Update the canonical `CREATE TABLE` literal so a fresh install gets the columns directly
- [ ] 1.3 Add `CREATE TABLE IF NOT EXISTS favorite_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, op TEXT NOT NULL CHECK (op IN ('add','update','remove','rollback')), source TEXT, video_id TEXT, page INTEGER, user_id TEXT, user_name TEXT, user_emoji TEXT, before_json TEXT, after_json TEXT)` plus the two indexes (by `ts`, by `(source, video_id, page, ts)`)

## 2. Backend types and row mapping

- [ ] 2.1 In `packages/backend/src/types.ts`, extend `Favorite` with `displayTitle?: string`, `authors?: string[]`, `mode?: "instr" | "vocal"`. Add a `FavoriteAuditEntry` type (`{id, ts, op, source?, videoId?, page?, user?, before?, after?}`) for the rollback CLI to consume
- [ ] 2.2 In `packages/backend/src/db.ts`, extend `FavoriteRow` with `display_title: string | null`, `authors: string | null`, `mode: string | null`. Update `${FAV_SELECT}` to include the three new columns
- [ ] 2.3 Update `rowToFavorite(r)` to surface `displayTitle` from `r.display_title ?? undefined`, `authors` parsed from `r.authors` (JSON-parse defensively, treat parse failure or non-array or empty array as undefined), `mode` validated against the two literals (anything else → undefined)
- [ ] 2.4 `addFavorite()` continues to insert NULL for the three new columns — no API change. Verify the existing INSERT statement's column list and parameter binding stay consistent

## 3. Audit + persistence helpers

- [ ] 3.1 Export `updateFavorite({source, videoId, page, displayTitle?, authors?, mode?})` from `db.ts`. Treats `undefined` as "no change" and `null` as "clear column to NULL". Returns the row before AND after the update (or `{before: null, after: null}` if no row matched), all inside a single transaction
- [ ] 3.2 Export `removeFavorite(source, videoId, page)` returning the deleted row's full state (or `null` if nothing matched), inside a transaction
- [ ] 3.3 Export `appendFavoriteAudit({ts, op, source?, videoId?, page?, user?, before?, after?})`. JSON-stringify `before`/`after` payloads. Inserts one audit row
- [ ] 3.4 Export `listFavoriteAudit(opts: {sinceTs?, untilTs?, limit?})` returning ordered audit rows (used by the rollback CLI)

## 4. WebSocket handlers

- [ ] 4.1 Add `favorite.update` handler in `packages/backend/src/ws.ts`: validate `(source, videoId, page)` and the optional `displayTitle` / `authors` / `mode` fields; reject `mode` not in `{instr, vocal}`; check rate limit (existing `favorite` bucket); call `updateFavorite()`; if a row was changed, append an audit row (`op='update'`, before/after) and broadcast `favorites` snapshot site-wide; if no row matched, respond `{type:"error", error:"unknown favorite"}`
- [ ] 4.2 Add `favorite.remove` handler: same identity validation; rate-limited; call `removeFavorite()`; if a row was deleted, append audit (`op='remove'`, before=row, after=null) and broadcast; if nothing matched, respond `unknown favorite`
- [ ] 4.3 Modify the existing `favorite.add` handler to also append an audit row (`op='add'`, before=null, after=inserted-row) on successful insert. Do NOT log on the no-op "first starrer wins" path (where the row already existed and we returned early) — that is not a state mutation
- [ ] 4.4 Reject `favorite.update` / `favorite.remove` if any unknown fields are present in the message (consistent with the existing `favorite.add` allowlist)

## 5. CLI rollback tool

- [ ] 5.1 New file `packages/backend/src/rollbackFavorites.ts` with a `main()` entrypoint that reads `process.argv[2]` as an ISO timestamp (or relative like `-1h`), parses it, prints usage on missing arg
- [ ] 5.2 Implement the replay: `listFavoriteAudit({untilTs: targetTs})`, walk in ts-ASC order, ignore `op='rollback'` rows, build a `Map<key, after-json | null>` where `null` marks "removed"; the final map values are the target favorites table state
- [ ] 5.3 Compute the diff against the current `favorites` table: `+rows` to insert, `~rows` to update (deep-equal compare on canonical fields), `-rows` to delete. Print the diff to stdout
- [ ] 5.4 If `--apply` is NOT in `process.argv`, exit cleanly with code 0 after printing the diff (dry-run is the default)
- [ ] 5.5 If `--apply` IS in `process.argv`, run the diff inside a single SQLite transaction: insert, update, delete in that order. Then append a `favorite_audit` row with `op='rollback'`, `before_json` = pre-rollback whole-table dump, `after_json` = post-rollback whole-table dump. Exit 0
- [ ] 5.6 Document in `packages/backend/README.md` (Rollback section) the exact invocation, dry-run vs apply semantics, and the warning that the script must not be exposed via HTTP / WS

## 6. Frontend — Favorite shape + render helper

- [ ] 6.1 In `packages/frontend/state.jsx` (or wherever the `Favorite` shape is mirrored), add `displayTitle?`, `authors?`, `mode?` fields
- [ ] 6.2 Create `packages/frontend/display.jsx` exporting `formatSongTitle(song, favoritesByKey)` and `favoritesByKey(favorites)`. Logic per spec: only return structured form when ALL THREE of `displayTitle` (non-empty string), `authors` (array length ≥1), `mode` (`"instr"` or `"vocal"`) are populated; otherwise return `song.title`
- [ ] 6.3 Compose: `[mode-zh] · [displayTitle] · [authors.join(", ")]` where `mode-zh` is `伴奏` for `instr`, `原唱` for `vocal`. No segment is omitted (since "all three" is enforced)

## 7. Frontend — call sites

- [ ] 7.1 Queue rows (queue render path) — replace direct `song.title` with `formatSongTitle(song, favoritesByKey)`
- [ ] 7.2 History rows (`HistoryList`) — same swap
- [ ] 7.3 Catalog rows (favorites modal) — same swap
- [ ] 7.4 NowPlayingBar — same swap
- [ ] 7.5 Any tooltip/title attribute reading `song.title` SHALL also use the helper

## 8. Frontend — Favorite Edit modal + catalog row buttons + star wiring

- [ ] 8.1 Build a `FavoriteEditSheet` component (in `packages/frontend/app-ui.jsx`) that takes `favorite, onSave, onDelete, onClose`. Three inputs: a text field for `displayTitle`, a comma-separated text field for `authors` (split on `, ` on Save; trim each entry; drop empties), a radio for `mode` with options `伴奏` / `原唱` / `unset`. Save triggers `onSave(patch)` with only the changed fields; Delete asks `window.confirm` then calls `onDelete()`; Cancel/Esc/backdrop calls `onClose`
- [ ] 8.2 Lift the `editingFavoriteKey` state to the `App` component so the catalog ✏️, queue-row ★ (filled), and history-row ★ (filled) can all set it. Render `<FavoriteEditSheet>` at the App root when set
- [ ] 8.3 Replace the catalog row's single "+ 加入" button with three icon buttons (✏️ edit, `+` add, 🗑 delete). Use existing `IconBtn` chrome
- [ ] 8.4 Wire ✏️ → `setEditingFavoriteKey(...)` (opens the sheet)
- [ ] 8.5 Wire 🗑 → `window.confirm` → `send({type:"favorite.remove", source, videoId, page})`
- [ ] 8.6 Modify the queue-row and history-row star button so a click on a *filled* star opens the edit sheet (NOT a `favorite.add`); empty star keeps the existing `favorite.add` path
- [ ] 8.7 Wire `onSave` in the sheet to `send({type:"favorite.update", source, videoId, page, ...patch})`; wire `onDelete` to `send({type:"favorite.remove", ...})`. Both close the sheet on the next `favorites` snapshot that reflects the change

## 9. Verify

- [ ] 9.1 `pnpm --dir packages/backend build && systemctl restart litektv.service`; `journalctl -u litektv` shows no migration errors; restart twice to confirm idempotence
- [ ] 9.2 Add a song to the catalog. Click ✏️, set all three fields, Save. The catalog row, queue row (if same song queued), history row (if seen), and NowPlayingBar (if currently playing) all show `[mode] · [name] · [authors]`
- [ ] 9.3 Edit again to clear `mode`. Every site falls back to the raw `song.title`
- [ ] 9.4 Click 🗑 on a catalog row → confirm → song disappears from the catalog modal everywhere; `journalctl -u litektv` shows the audit row insert
- [ ] 9.5 In another browser window: click a *filled* star on a queue row. The edit sheet opens with that favorite's fields. Save / cancel / delete behave as spec'd
- [ ] 9.6 SQL inspection: `SELECT op, count(*) FROM favorite_audit GROUP BY op` shows non-zero `add` / `update` / `remove` counts after the above test
- [ ] 9.7 Capture `now()` as `T0`. Make several changes (add, edit, remove). Run `pnpm --dir packages/backend tsx src/rollbackFavorites.ts <T0 ISO>` (no `--apply`). The dry-run prints `~` / `-` / `+` lines and does NOT touch the table. Re-run with `--apply` — the table reverts to its T0 state, and a new `op='rollback'` row appears in `favorite_audit`
- [ ] 9.8 Confirm there is NO HTTP / WS path that reaches the rollback logic: `grep -n "rollbackFavorites\|favorite.rollback" packages/backend/src/{ws,rest,index}.ts` returns 0 matches