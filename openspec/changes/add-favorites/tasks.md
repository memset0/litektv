## 1. Backend storage scaffolding

- [x] 1.1 In `packages/backend/src/db.ts`, add idempotent `CREATE TABLE IF NOT EXISTS` for `favorites` (PK `(source, video_id, page)`, with `added_by_*` columns) plus `idx_favorites_added`. The favorites set is GLOBAL — no `owner_key` column.
- [x] 1.2 Add typed accessors in `db.ts`: `listFavorites()`, `findFavorite(source, videoId, page)`, `addFavorite(row)` (idempotent on PK; first starrer wins). NO `removeFavorite` — favorites are add-only in v1.
- [x] 1.3 Extend `packages/backend/src/types.ts` with `Favorite` (incl. `addedBy: {id?, name, emoji} | null`) and `SongRef`.

## 2. Backend parser canonicalization

- [x] 2.1 In `packages/backend/src/parser.ts`, audit `parseYouTube` and `parseBilibili` to confirm they only read the allowlisted query params (`v`, `p`); add a comment block at the top of the file declaring the allowlist as load-bearing for privacy.
- [x] 2.2 Add an exported `parseRef(ref): Promise<ParsedSongMeta>` that skips URL extraction/redirect resolution and only runs the metadata fetch path.
- [x] 2.3 Update `/api/parse-link` in `packages/backend/src/rest.ts` to accept either `{url}` or `{ref}` and dispatch to `parseLink`/`parseRef` accordingly; reject payloads carrying both.
- [x] 2.4 Add a regression test (vitest, `packages/backend/src/parser.test.ts`) asserting that the spm/vd_source/etc-laden Bilibili URL produces output with no extra fields and that `parseRef` doesn't hit the redirect resolver.

## 3. Backend favorites WS handlers

- [x] 3.1 Per-connection state `{userId}` set on `hello`. A flat `allConnections` set holds every active WS for site-wide favorites broadcasting.
- [x] 3.2 Implement WS handlers `favorite.add` and `favorite.list` in `ws.ts`. `favorite.add` accepts `{source, videoId, page?, title?, thumb?, duration?}` and uses the strict zod schema so unknown keys cause `{type:"error", error:"unknown field"}`. Missing metadata is filled in via `parseRef`. The server stamps `addedBy` from the connection's presence — clients can't supply it. There is NO `favorite.remove` in v1.
- [x] 3.3 After every successful favorite mutation, broadcast `{type:"favorites", favorites}` to **every** connected client (regardless of room).
- [x] 3.4 On every successful `hello`, send a fresh `favorites` snapshot ordered by `added_at DESC`.
- [x] 3.5 Extend `queue.add` to accept `{ref:{source, videoId, page?}}`; on the `ref` path, look up cached favorite metadata first, falling back to `parseRef`. Resulting `Song.addedBy` is the current user, NOT the favorite's first-starrer.
- [x] 3.6 Add the favorites combined rate limit (`60/min` per `userId`).

## 4. Frontend favorites store

- [x] 4.1 In `packages/frontend/state.jsx`, add a `favorites` store that subscribes to `{type:"favorites"}` messages and exposes `useFavorites()` returning `[favorites[], { addFavorite, isFavorited }]`. The list is global, and the hook is add-only (no `removeFavorite`).
- [x] 4.2 No session token / account logic. Identity stays the existing `localStorage` `userId`. The legacy `ktv:session` key (left over from a discarded design) is wiped on load.
- [x] 4.3 In `app.jsx`, `addSong` always overwrites the song's `addedBy` with current `me` so re-queueing from history (+ REPLAY) or from the catalog always shows the live user's name, not the original adder's.

## 5. Frontend pinyin search helper

- [x] 5.1 Add `pinyin-pro` UMD via CDN in `KTV.html`.
- [x] 5.2 Implement `buildIndex(title) -> {full, initials, lower}` and `matchQuery(query, index) -> boolean` for case-insensitive substring matching, in `pinyin-search.jsx`.
- [x] 5.3 Memoize the per-favorite indexes keyed by `(source, videoId, page, title)` so re-renders don't recompute pinyin.

## 6. Frontend UI rework

- [x] 6.1 In `packages/frontend/app-ui.jsx`, replace the side-panel "Queue" header button with a `+` icon button (opens the existing add-link input) and an adjacent 📚 icon button (opens the catalog modal).
- [x] 6.2 Build the catalog modal (`catalog.jsx`): centered dialog with backdrop, search input pinned at the top, list ordered by `added_at` DESC, Esc-to-close + backdrop-click-to-close. Each row shows title / source badge / favoriter (`addedBy.emoji name`) / single "+ 加入" action. NO unstar control in v1.
- [x] 6.3 Wire the modal's "+ 加入" action to `send({type:"queue.add", ref:{source, videoId, page}})` and show a transient confirmation on the row; keep the modal open.
- [x] 6.4 Add a star button to every queue row and history row. Empty/filled icon reflects the current global favorites snapshot. When filled the button is `disabled` (with `已收藏` tooltip) — v1 is add-only, no unstar.

## 7. Privacy / canonicalization sweep

- [x] 7.1 Grep the backend and frontend for any place that stashes `req.body.url`, `originalUrl`, or `share_text` into state, persisted records, or logs; remove them. (Frontend `urlparse.jsx` no longer attaches `originalUrl: text` to its return shape.)
- [x] 7.2 Confirm by code inspection (and add a unit test) that `Song`/favorite serialization paths only emit the canonical field allowlist.

## 8. Tests

- [x] 8.1 Vitest: parser canonicalization (URL with spm_id_from), `parseRef` round-trip, favorites idempotent add (first-starrer wins), Bilibili page separation, global visibility. **10 tests passing.** (Remove tests dropped along with the remove path.)
- [ ] 8.2 Manual: user A stars in room aaa; user B in room bbb (different room) immediately sees the star and the entry in their catalog modal — favorites are global.
- [ ] 8.3 Manual: paste the spm-laden Bilibili URL from the user's note, confirm the queued song record contains only canonical fields (inspect via `sqlite3 data/litektv.db 'select state from rooms where slug=?'`).
- [ ] 8.4 Manual: open the catalog modal with a list including `小镇姑娘`, verify `xzgn`, `xiaozhen`, and partial-substring queries all match.

## 9. Ship

- [x] 9.1 Per the project's auto-commit rule, each numbered group landed in its own conventional commit and was pushed immediately. Stage only the files modified for that group — never `git add -A`.
- [ ] 9.2 Run `openspec archive add-favorites` (or `/opsx:archive`) once the manual tests in §8 are verified.

## 10. Deferred (NOT in v1)

- [ ] 10.1 Add `favorite.remove` WS handler + DB accessor + frontend affordance once the product decides on the semantics (anyone-can-remove vs only-the-favoriter vs admin-only). Until then, removing a favorite requires `DELETE FROM favorites WHERE …` on the operator side.
