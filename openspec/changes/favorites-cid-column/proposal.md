## Why

`bilibili-page-via-cid` (archived 2026-05-08) explicitly deferred storing `cid` on the favorites row, with the workaround of re-fetching `cid` via `parseRef` on every catalog re-add. That's wasteful: 24/25 of the user's favorites are Bilibili songs, so every "add to queue from catalog" pays one round-trip to `api.bilibili.com/x/web-interface/view` even though the cid is invariant for a `(videoId, page)` pair. It's also a uptime dependency — if Bilibili's API is unreachable, the user can't queue from their own saved catalog.

Lift the carve-out: persist `cid` on the favorites row so re-add is zero-cost, and so the catalog itself can ship `cid` in `queue.add` refs. Existing favorites (24 Bilibili rows) get backfilled in the same operator step that lands the schema change.

The companion ask — graceful behavior when the upstream cid fetch fails — is already true in code (`fetchBilibiliMeta` returns `{}` on any fetch / parse / non-zero-code error; `finalizeMeta` copies `cid: meta.cid` which is `undefined` then; `embedUrl` branches on `song.cid` and falls back to `p` / `page`). This change documents that contract in the spec so future code keeps it.

## What Changes

- **MODIFIED** `favorites`: the favorites row gains an optional `cid: number | null` column. Schema migration follows the existing idempotent `ALTER TABLE favorites ADD COLUMN` pattern (`favorites-rich-metadata` shipped). The PK `(source, video_id, page)` is unchanged — `cid` is a derived metadata field, not a key.
- **MODIFIED** `favorites`: `favorite.add` accepts `cid?: number` in the wire payload (already in the schema after `bilibili-page-via-cid`) and now persists it to the row instead of dropping it.
- **MODIFIED** `favorites`: every `Favorite` snapshot the server broadcasts SHALL carry `cid` when the row has one, so the frontend's catalog modal can ship `cid` in its `queue.add` ref payload without a round-trip.
- **MODIFIED** `link-parser`: clarify the existing-but-undocumented contract that cid extraction failure SHALL NOT crash any caller — `parseLink` / `parseRef` SHALL return a `ParsedSongMeta` with `cid: undefined` on failure, and downstream `embedUrl` SHALL fall back to `p` (mobile) / `page` (desktop).

## Capabilities

### New Capabilities

(None.)

### Modified Capabilities

- `favorites`: extend the row schema and the wire snapshot with `cid?: number`.
- `link-parser`: document the cid-fetch-failure-is-non-fatal contract.

## Impact

**Code**
- `packages/backend/src/db.ts` — extend the migration list with `"cid INTEGER"`. `CREATE TABLE` block adds the column. `FAV_SELECT` reads it. `addFavorite` / `updateFavorite` (if it ever sets cid) persist it. `FavoriteRow` interface gains `cid: number | null`. Read path maps `null` → `undefined` so the in-memory `Favorite` matches the Type.
- `packages/backend/src/types.ts` — add `cid?: number` to `Favorite`.
- `packages/backend/src/ws.ts` — `favorite.add` handler now passes `cid: parsed.song.cid` to `addFavorite`.
- `packages/frontend/src/state.tsx` — `useFavorites().addFavorite(song)` already reads `song.cid` as part of the spread; no behavior change but the type now declares cid.
- `packages/frontend/src/catalog.tsx` — `onAddRef` passes `cid: f.cid` so the backend's `queue.add` ref branch can skip the re-parse when the favorite already has a cid.
- A one-off backfill script (analogous to the rooms backfill) fills cid for the 24 existing Bilibili favorites.

**Data**
- 24 existing Bilibili favorites are backfilled during apply via the same Bilibili API the parser already calls. The backfill is idempotent (only fills NULL cid).

**Wire compatibility**
- `cid` was already optional on `favorite.add` and on the broadcast `Favorite` payload (any extra field is ignored by older clients). Backwards compatible both ways.

**Out of scope**
- No change to the favorites PK. cid is metadata, not a key.
- No retroactive editing of catalog UI beyond passing cid in the ref. The existing FavoriteEditSheet doesn't need a cid field.
