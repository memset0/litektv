## Why

Today the queue lives entirely inside one room, so a song someone enjoys vanishes the moment its slug is forgotten or the room is GC'd. People who repeatedly sing the same handful of tracks have to re-paste BV/YouTube links every session, and there is no cross-room "my songs" surface. While we're at it, link normalization needs to stop bleeding tracking junk (e.g. Bilibili `spm_id_from`, `vd_source`) into stored records.

## What Changes

- New cross-room **favorites** capability: any user can star a song from the queue or history, and the same starred list is visible in every room they join from the same browser.
  - Stored as just `{source, videoId, page?, title, thumb?, addedAt}` per entry — keyed by canonical IDs, not raw URLs.
  - Identity is the existing `localStorage` `userId` UUID. Same browser → same favorites everywhere; different browser → fresh list. **No login, no account, no password.** The user's freely-set name+emoji combo (already configurable via the existing profile sheet) is the only identity layer.
  - **BREAKING (storage):** parser output and any stored `Song`/favorite record SHALL drop unrecognized URL query params. Callers that relied on echoing the original URL must read `source`+`videoId`+`page` instead.
- Queue intake (`queue.add`) and favorites add SHALL accept a favorite reference (`{source, videoId, page?}`) directly, so re-queueing a starred song doesn't require re-parsing the original URL.
- UI rework on the side panel: replace the existing **Queue** action button with a **`+`** button (paste/parse a new link) and add a sibling **catalog** button that opens a favorites **modal** (centered popup; list ordered by `added_at` descending; search input pinned at the top; Esc / backdrop click closes).
- Catalog search supports **pinyin / pinyin-initials / fuzzy substring** matching so Chinese titles are reachable by typing `xzgn` for `小镇姑娘` etc.
- Bilibili multi-`p` page index continues to be preserved end-to-end (parser → favorite → queue add); we are not adding a new page picker yet but everything stays compatible for when we do.

## Capabilities

### New Capabilities

- `favorites`: per-user, cross-room starred song list. Persistence, add/remove semantics, dedupe by `(source, videoId, page)`, and the search/match rules used by the catalog modal.

### Modified Capabilities

- `link-parser`: parser output and the request contract SHALL strip non-canonical query params; only `source`, `videoId`, and (for Bilibili) `page` survive normalization. Adds support for parsing already-canonical favorite refs without re-fetching metadata when the title is already known.
- `queue-controls`: side-panel action area replaces the Queue button with a `+` button, adds a catalog button, and adds a "star this song" affordance on queue and history rows. `queue.add` accepts either a raw URL or a `{source, videoId, page?}` ref.
- `room-state-sync`: WebSocket gains `favorite.add` / `favorite.remove` / `favorite.list` messages and a `favorites` snapshot scoped to the connected `userId` (favorites are NOT part of `RoomState`; they ride a parallel per-user channel so they propagate across rooms).
- `room-persistence`: SQLite schema gains a `favorites` table. Existing `rooms` table is unchanged.

## Impact

- **Backend (`packages/backend/src`)**: `parser.ts` (canonicalize, strip params), `types.ts` (favorite types), `db.ts` (new `favorites` table + accessors), `ws.ts` (favorite message handlers + per-userId owner key), `rest.ts` (only `parse-link` updated).
- **Frontend (`packages/frontend`)**: `state.jsx` (favorites store), `app-ui.jsx` and `ktv.css` (replace Queue button with `+` and catalog buttons, modal UI), new pinyin-search helper module, queue/history rows gain a star toggle.
- **Storage**: new SQLite table `favorites(owner_key, source, videoId, page, title, thumb, duration, added_at, PRIMARY KEY(owner_key, source, videoId, page))` where `owner_key = "anon:<userId>"`. No room-table changes.
- **Privacy**: Bilibili share URLs with `spm_id_from`, `vd_source`, etc. SHALL no longer be persisted anywhere.
- **Out of scope**: any account/login/password system; cross-device sync of favorites (user said no — `localStorage` userId is the only identity); full Bilibili `?p=` page-picker UI.
