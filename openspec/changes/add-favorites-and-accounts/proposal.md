## Why

Today the queue lives entirely inside one room, so a song someone enjoys vanishes the moment its slug is forgotten or the room is GC'd. People who repeatedly sing the same handful of tracks have to re-paste BV/YouTube links every session, and there is no cross-room "my songs" surface. We also need a lightweight identity layer so a user's saved list follows them everywhere, with anonymous-but-persistent saves as a fallback. While we're at it, link normalization needs to stop bleeding tracking junk (e.g. Bilibili `spm_id_from`, `vd_source`) into stored records.

## What Changes

- New cross-room **favorites** capability: any user can star a song from the queue or history, and the same starred list is visible in every room.
  - Stored as just `{source, videoId, page?, title, thumb?, addedAt}` per entry — keyed by canonical IDs, not raw URLs.
  - **BREAKING (storage):** parser output and any stored `Song`/favorite record SHALL drop unrecognized URL query params. Callers that relied on echoing the original URL must read `source`+`videoId`+`page` instead.
- New **user accounts** capability: lightweight login (display name + emoji avatar, optional password / magic link) so the same favorites list can be reached from any browser. Anonymous users still get a stable per-device favorites list keyed by their existing `localStorage` `userId`; logging in merges device favorites into the account.
- Queue intake (`queue.add` and `queue.add-from-favorite`) and favorites add SHALL accept a favorite reference (`{source, videoId, page?}`) directly, so re-queueing a starred song doesn't require re-parsing the original URL.
- UI rework on the side panel: replace the existing **Queue** action button with a **`+`** button (paste/parse a new link) and add a sibling **catalog** button that opens the favorites drawer.
- Favorites drawer supports search over title with **pinyin / pinyin-initials / fuzzy substring** matching so Chinese titles are reachable by typing `xzgn` for `小镇姑娘` etc.
- Bilibili multi-`p` page index continues to be preserved end-to-end (parser → favorite → queue add); we are not adding a new page picker yet but everything stays compatible for when we do.

## Capabilities

### New Capabilities

- `favorites`: per-user, cross-room starred song list. Persistence, add/remove semantics, dedupe by `(source, videoId, page)`, and the search/match rules used by the catalog drawer.
- `user-accounts`: optional account layer (login + anonymous) that owns a `userId` across devices, plus the merge rule that fuses an anonymous device's favorites into a freshly logged-in account.

### Modified Capabilities

- `link-parser`: parser output and the request contract SHALL strip non-canonical query params; only `source`, `videoId`, and (for Bilibili) `page` survive normalization. Adds support for parsing already-canonical favorite refs without re-fetching metadata when the title is already known.
- `queue-controls`: side-panel action area replaces the Queue button with a `+` button, adds a catalog button, and adds a "star this song" affordance on queue and history rows. `queue.add` accepts either a raw URL or a `{source, videoId, page?}` ref.
- `room-state-sync`: WebSocket gains `favorite.add` / `favorite.remove` / `favorite.list` messages and a `favorites` snapshot scoped to the connected `userId` (favorites are NOT part of `RoomState`; they ride a parallel per-user channel so they propagate across rooms). Adds an optional `auth.login` / `auth.logout` flow on the same socket.
- `room-persistence`: SQLite schema gains `users` (account records) and `favorites` (per-`userId` rows). Existing `rooms` table is unchanged.

## Impact

- **Backend (`packages/backend/src`)**: `parser.ts` (canonicalize, strip params), `types.ts` (favorite/user types), `db.ts` (new tables + migrations), `ws.ts` (favorite + auth message handlers), `rest.ts` (optional account endpoints), `rooms.ts` (no longer the source of truth for favorites).
- **Frontend (`packages/frontend`)**: `state.jsx` (favorites store + auth state), `app-ui.jsx` and `ktv.css` (replace Queue button with `+` and catalog buttons, drawer UI), new pinyin-search helper module, queue/history rows gain a star toggle.
- **Storage**: new SQLite tables `users(userId, name, emoji, password_hash?, created_at, last_seen)` and `favorites(userId, source, videoId, page, title, thumb, added_at, PRIMARY KEY(userId, source, videoId, COALESCE(page,0)))`. No room-table changes.
- **Privacy**: Bilibili share URLs with `spm_id_from`, `vd_source`, etc. SHALL no longer be persisted anywhere. Existing rooms keep their songs (titles already populated from API), but on the next mutation the server SHALL drop any non-canonical URL fields it might have stored.
- **Out of scope**: live re-synchronization of favorites between simultaneous logged-in sessions of the same account beyond best-effort broadcast on the user's own sockets; full Bilibili `?p=` page-picker UI; OAuth or third-party identity providers.
