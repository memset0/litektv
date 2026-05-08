## Why

Today the `favorites` table only carries the song's raw imported `title`. The user keeps a mix of 伴奏 (instrumental) and 原唱 (original-vocal) tracks, often with messy traditional/simplified mixed Chinese titles or no author credit at all. They want:

1. A clean **canonical song name** (simplified Chinese for CN parts, English unchanged) separate from the raw imported title.
2. An **author list** for songs with multiple credited people (singer + composer + lyricist, comma-separated).
3. A **mode flag** for 伴奏 / 原唱.
4. A way to **edit** these three fields per row from the My Songs (catalog) modal.
5. A way to **delete** a row from the catalog modal.
6. An **audit log + CLI-only rollback tool** so abuse (or a bad edit) can be reverted to a specific point in time without a redo from memory.

## What Changes

### Schema (additive)

- `favorites` table gains three nullable columns: `display_title TEXT`, `authors TEXT` (JSON array as text), `mode TEXT CHECK (mode IS NULL OR mode IN ('instr','vocal'))`. Idempotent boot migration via `ALTER TABLE favorites ADD COLUMN ...` guarded so old DBs auto-upgrade.
- New `favorite_audit` table that logs every favorite mutation (`add`, `update`, `remove`) with the full row state before AND after, plus the actor's `userId` / `name` / `emoji` and a timestamp. Append-only, indexed by `ts`.

### WebSocket protocol

- Add `{type:"favorite.update", source, videoId, page, displayTitle?, authors?, mode?}` — partial update; fields not present in the message are NOT touched. After a successful update the server broadcasts the global `favorites` snapshot (same path the existing `favorite.add` uses).
- Add `{type:"favorite.remove", source, videoId, page}` — deletes the row, broadcasts the snapshot.
- Both new messages share the existing per-userId rate limit budget with `favorite.add` (60/min — anyone hammering the catalog hits the same bucket).

### Display rule (frontend)

The rendering helper SHALL show the structured form **only when ALL three** of `displayTitle`, non-empty `authors`, and `mode` are populated on the matching favorite row. If any one of the three is missing — or the song is not favorited — render the raw `title` exactly as today.

Structured form: `[伴奏|原唱] · [displayTitle] · [author1, author2, ...]`

Mode maps `instr → 伴奏`, `vocal → 原唱`. Authors join with `, `.

### Catalog modal — edit + delete

Each row in the My Songs / catalog modal currently exposes a single `+ 加入` button. Replace that with three icon buttons left-to-right:

```
[ ✏️ edit ]  [ + add to queue ]  [ 🗑 delete ]
```

- **Edit** opens a small modal with three inputs (display title, authors as a comma-separated text input or tag input, mode as a radio: 伴奏 / 原唱 / unset) plus Save / Cancel. Save sends `favorite.update`. Cancel closes.
- **Add** keeps existing behavior — sends `queue.add` with a `ref:{source,videoId,page}`.
- **Delete** asks `window.confirm` with the song title; on confirm, sends `favorite.remove`.

### Star button — click-when-already-favorited opens the edit modal

Today: ★ on a queue / history row is `disabled` with a `已收藏` tooltip when the song is already in favorites. Change to: clicking a filled ★ opens the same edit modal that the catalog row's edit button opens, scoped to that song. Empty ★ behaviour unchanged (sends `favorite.add`).

### Audit log + CLI rollback

- Every successful `favorite.add` / `favorite.update` / `favorite.remove` SHALL append one row to `favorite_audit` capturing `(ts, op, source, video_id, page, user_id, user_name, user_emoji, before_json, after_json)`. Failed operations (rate-limited, validation errors) MUST NOT log.
- A CLI script (`pnpm --dir packages/backend tsx src/rollbackFavorites.ts <ISO timestamp>`) reads the audit log, computes what every favorite key looked like at the target timestamp, and rewrites the `favorites` table to match — all in one transaction. The script SHALL print a dry-run diff first and require an explicit `--apply` flag to commit.
- Rollback is **CLI-only**. There SHALL be no `/api/...` route, no WS message, no frontend control that can trigger it. Anyone with rollback authority needs SSH/local-shell access to the backend host.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `favorites` — edit/remove WS messages, "all three" rendering rule, click-filled-★-to-edit, audit log + CLI rollback.
- `room-persistence` — favorites table gains three columns, new `favorite_audit` table.
- `queue-controls` — catalog row gets three buttons (edit, +, delete); ★-when-favorited opens the edit modal.

## Impact

- Affected code:
  - `packages/backend/src/db.ts` — schema migrations + audit table + read/write helpers + audit-write helpers + rollback logic primitives.
  - `packages/backend/src/types.ts` — `Favorite` gains optional fields; new `FavoriteAuditEntry` type.
  - `packages/backend/src/ws.ts` — handlers for `favorite.update` / `favorite.remove` (with audit writes); rate-limit shared with `favorite.add`.
  - `packages/backend/src/rollbackFavorites.ts` — new CLI entrypoint.
  - `packages/frontend/state.jsx` — `Favorite` shape mirror; client helpers for `favorite.update` / `favorite.remove`.
  - `packages/frontend/app-ui.jsx` — new `FavoriteEditSheet` component, new `formatSongTitle` helper, three-button row in catalog, ★ click-when-filled wiring.
  - `packages/frontend/app.jsx` — wire the edit sheet open/close state at the appropriate parent level so both the catalog row and the ★ buttons can trigger it.
- Affected data: `favorites` rows pick up three NULL columns; new `favorite_audit` rows append on every mutation. None of this is committed to git (lives in `backend/data/litektv.db`).
- Backwards compatibility: a favorite with no manual metadata renders identically to today; clients that don't know about `favorite.update` / `favorite.remove` still work for view-only.
