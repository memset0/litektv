## Why

Today the queue lives entirely inside one room, so a song someone enjoys vanishes the moment its slug is forgotten or the room is GC'd. People who repeatedly sing the same handful of tracks have to re-paste BV/YouTube links every session, and there is no shared "favorites" surface. While we're at it, link normalization needs to stop bleeding tracking junk (e.g. Bilibili `spm_id_from`, `vd_source`) into stored records.

## What Changes

- New **favorites** capability that is **GLOBAL — site-wide and shared by every visitor**. Any user can star a song from the queue or history; everybody connected anywhere on the site sees the same list. There is no per-user list.
  - Persisted in SQLite, keyed by `(source, videoId, page)`. First-starrer wins on conflict; subsequent stars of the same song are no-ops.
  - Each favorite row records `addedBy` — the display name + emoji of whoever first starred it — so the catalog modal can show "added by ALICE 🎤" alongside each entry.
  - **Add-only in v1.** Removing a song from the favorites list is intentionally not supported yet — once starred, a song stays in the global list. The catalog modal has no "unstar" affordance, and the star button on queue/history rows becomes non-interactive once filled. We'll revisit when the product needs it.
  - **BREAKING (storage):** parser output and any stored `Song`/favorite record SHALL drop unrecognized URL query params. Callers that relied on echoing the original URL must read `source`+`videoId`+`page` instead.
- Queue intake (`queue.add`) and favorites add SHALL accept a favorite reference (`{source, videoId, page?}`) directly, so re-queueing a starred song doesn't require re-parsing the original URL.
- The queue's `addedBy` is always stamped to the **current user** — replaying a song from history or re-queueing from the catalog SHALL show the live user's name, not whoever queued it the first time.
- UI rework on the side panel: replace the existing **Queue** action button with a **`+`** button (paste/parse a new link) and add a sibling **catalog** button that opens a favorites **modal** (centered popup; list ordered by `added_at` descending; search input pinned at the top; Esc / backdrop click closes).
- Catalog search supports **pinyin / pinyin-initials / fuzzy substring** matching so Chinese titles are reachable by typing `xzgn` for `小镇姑娘` etc.
- Bilibili multi-`p` page index continues to be preserved end-to-end (parser → favorite → queue add); we are not adding a new page picker yet but everything stays compatible for when we do.

## Capabilities

### New Capabilities

- `favorites`: site-wide starred song list. Persistence, add/remove semantics, dedupe by `(source, videoId, page)`, the recorded `addedBy` of the first starrer, and the search/match rules used by the catalog modal.

### Modified Capabilities

- `link-parser`: parser output and the request contract SHALL strip non-canonical query params; only `source`, `videoId`, and (for Bilibili) `page` survive normalization. Adds support for parsing already-canonical favorite refs without re-fetching metadata when the title is already known.
- `queue-controls`: side-panel action area replaces the Queue button with a `+` button, adds a catalog button, and adds a "star this song" affordance on queue and history rows. `queue.add` accepts either a raw URL or a `{source, videoId, page?}` ref. Replay/re-add operations stamp `addedBy` to the current user, not the original.
- `room-state-sync`: WebSocket gains `favorite.add` / `favorite.remove` / `favorite.list` messages and a `favorites` snapshot. Snapshots are GLOBAL — every connected client receives the same list and sees every mutation in real time. Favorites are NOT part of `RoomState`.
- `room-persistence`: SQLite schema gains a `favorites` table. Existing `rooms` table is unchanged.

## Impact

- **Backend (`packages/backend/src`)**: `parser.ts` (canonicalize, strip params), `types.ts` (favorite types incl. `addedBy`), `db.ts` (new `favorites` table + accessors), `ws.ts` (favorite handlers, broadcast to ALL connected clients), `rest.ts` (only `parse-link` updated).
- **Frontend (`packages/frontend`)**: `state.jsx` (favorites store), `app-ui.jsx` and `ktv.css` (replace Queue button with `+` and catalog buttons, modal UI), new pinyin-search helper module, queue/history rows gain a star toggle, `addSong` always stamps the current user as `addedBy`.
- **Storage**: new SQLite table `favorites(source, videoId, page, title, thumb, duration, added_by_id, added_by_name, added_by_emoji, added_at, PRIMARY KEY(source, videoId, page))`. No room-table changes.
- **Privacy**: Bilibili share URLs with `spm_id_from`, `vd_source`, etc. SHALL no longer be persisted anywhere.
- **Out of scope**: any account/login/password system; per-user favorite lists or visibility scoping (favorites are public to all visitors); removing a song from favorites (deferred to a follow-up); full Bilibili `?p=` page-picker UI.
