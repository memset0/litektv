## Why

The previously-shipped `bilibili-page-playback` change (archived 2026-05-08) had the frontend append `&page=N` to the Bilibili `player.bilibili.com/player.html` iframe URL so multipart videos opened on the right `P`. That worked at the time, but the live deployment now plays P1 regardless of whether the song record carries `page=2`, `page=4`, etc. The backend correctly extracts `?p=N` from the pasted URL and stores it on the song record (verified via SQLite — the queue / history rows have correct `page` fields and titles like `…- P4 苏州河_…`), so the regression is **inside the player iframe**: Bilibili's player.html has stopped honoring `&page=N` reliably (or always has, on certain client versions).

The robust fix is to use Bilibili's per-page **`cid`** (the unique content-id of a single sub-clip), which the player has consistently honored as the most precise resource selector. The Bilibili API endpoint `api.bilibili.com/x/web-interface/view` already returns `pages: [{cid, page, part, duration}]`; we read `page`, `part`, `duration` today but throw `cid` away. Fetch it, persist it on the song, and use `&cid=N` in the embed URL.

## What Changes

- **MODIFIED** `link-parser`: the backend's parsed metadata response SHALL include a `cid?: number` field for Bilibili sources, set to the `cid` of the requested `page` (or the top-level `cid` for single-part videos). The field is OPTIONAL — older clients ignore it; the backend MAY omit it if the upstream API call failed. The same `link-parser` capability also covers the frontend `embedUrl` helper (which currently lives in the same module the spec already talks about), so the new "embed URL prefers cid over page" rule is added in the same delta.
- **NOT changed**: the WS protocol's overall message shape (`Song.cid?` is just a new optional field on a payload that already accepts arbitrary additional metadata), the SQLite schema (rooms still serialize as a JSON blob, so `cid` flows through automatically), or the favorites table structure.

## Capabilities

### New Capabilities

(None.)

### Modified Capabilities

- `link-parser`: extend the parsed-metadata contract with the optional `cid` field for Bilibili, plus the embed-URL parameter switch (`page=` → `p=` + `cid=`). `room-state-sync` doesn't pin down the `Song` shape at the requirement level today, so adding the optional `cid` field is a non-spec, backwards-compatible code change there.

## Impact

**Code**
- `packages/backend/src/parser.ts` — `fetchBilibiliMeta` extracts `cid` for the requested page; `finalizeMeta` returns it; `parseRef` carries it through.
- `packages/backend/src/types.ts` — add `cid?: number` to `ParsedSongMeta` and `Song`. (And `Favorite` for symmetry, optional.)
- `packages/backend/src/ws.ts` — `songSchema` and `songRefSchema` accept `cid?: number`; `queue.add` propagates it to the stored song; `favorite.add` similarly.
- `packages/backend/src/db.ts` — favorites table schema is unchanged (a separate change can add a `cid` column later if needed). Rooms persist as JSON, so `cid` flows through automatically.
- `packages/frontend/src/urlparse.ts` — `embedUrl` uses `&cid=${song.cid}` when present, else `&p=${song.page || 1}`. Drop the obsolete `&page=N` param.
- `packages/frontend/src/state.tsx`, `app-ui.tsx`, `app.tsx` — Song type is auto-imported from `@litektv/types`, so the new optional field is picked up at compile time. `addSong` / replay / catalog paths preserve `cid` via `…s` spread.

**Live data**
- Songs already in the queue / history / favorites do NOT have `cid`. They'll fall back to `&p=N`, which MAY also work depending on Bilibili's current player. If they still don't honor `p=N`, those rows will play P1 until they're re-queued (re-parse fetches `cid`).
- No DB migration. The favorites table currently stores `(source, video_id, page)` as the PK; we don't change the PK. Adding `cid` to the favorite *row* is a separate concern (future change).

**Wire compatibility**
- `cid` is OPTIONAL in every schema, so older frontends silently drop it (their `Song` type is the same shape with cid undefined; `embedUrl` falls back to `&p=N`). Older backends never emit `cid`; new frontends fall back to `&p=N`.

**Out of scope**
- Storing `cid` in the favorites table (would need a column add + read/write paths). Re-parse on add-from-catalog still works — the catalog ref path goes through `parseRef`, which after this change emits `cid`.
- A heuristic to "auto-fix" old queue rows by background-fetching `cid` for them. Not worth the cost; users will re-queue eventually.
- Migrating the existing `&page=N` callers off — there's only one (`embedUrl`).
