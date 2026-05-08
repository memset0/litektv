## 1. Backend storage scaffolding

- [x] 1.1 In `packages/backend/src/db.ts`, add idempotent `CREATE TABLE IF NOT EXISTS` for `favorites` plus `idx_favorites_owner_added`.
- [x] 1.2 Add typed accessors in `db.ts`: `listFavorites(ownerKey)`, `findFavorite(ownerKey, source, videoId, page)`, `addFavorite(row)` (idempotent on PK), `removeFavorite(ownerKey, source, videoId, page)`.
- [x] 1.3 Extend `packages/backend/src/types.ts` with `Favorite`, `OwnerKey` (`anon:${string}` only), and `SongRef`.

## 2. Backend parser canonicalization

- [x] 2.1 In `packages/backend/src/parser.ts`, audit `parseYouTube` and `parseBilibili` to confirm they only read the allowlisted query params (`v`, `p`); add a comment block at the top of the file declaring the allowlist as load-bearing for privacy.
- [x] 2.2 Add an exported `parseRef(ref): Promise<ParsedSongMeta>` that skips URL extraction/redirect resolution and only runs the metadata fetch path.
- [x] 2.3 Update `/api/parse-link` in `packages/backend/src/rest.ts` to accept either `{url}` or `{ref}` and dispatch to `parseLink`/`parseRef` accordingly; reject payloads carrying both.
- [x] 2.4 Add a regression test (vitest, `packages/backend/src/parser.test.ts`) asserting that the spm/vd_source/etc-laden Bilibili URL produces output with no extra fields and that `parseRef` doesn't hit the redirect resolver.

## 3. Backend favorites WS handlers

- [x] 3.1 Per-connection state `{userId, ownerKey}` is set on `hello`; `ownerKey` is always `anon:<userId>`. A `connectionsByOwner` map indexes connections by ownerKey for fan-out.
- [x] 3.2 Implement WS handlers `favorite.add`, `favorite.remove`, `favorite.list` in `ws.ts`. `favorite.add` accepts `{source, videoId, page?, title?, thumb?, duration?}` and uses the strict zod schema so unknown keys cause `{type:"error", error:"unknown field"}`. Missing metadata is filled in via `parseRef`.
- [x] 3.3 After every successful favorite mutation, broadcast `{type:"favorites", favorites}` to every WS sharing the mutator's `ownerKey`.
- [x] 3.4 On every successful `hello`, send a fresh `favorites` snapshot ordered by `added_at DESC`.
- [x] 3.5 Extend `queue.add` to accept `{ref:{source, videoId, page?}}` (in addition to `{song:...}`); on the `ref` path, look up cached favorite metadata first, falling back to `parseRef`.
- [x] 3.6 Add the favorites combined rate limit (`60/min` per `ownerKey`).

## 4. Frontend favorites store

- [x] 4.1 In `packages/frontend/state.jsx`, add a `favorites` store that subscribes to `{type:"favorites"}` messages and exposes `useFavorites()` plus `addFavorite(song)` / `removeFavorite(song)` / `isFavorited(song)` helpers.
- [x] 4.2 No session token logic; identity stays the existing `localStorage` `userId`. The legacy `ktv:session` key (left over from a discarded design) is wiped on load.

## 5. Frontend pinyin search helper

- [x] 5.1 Add `pinyin-pro` UMD via CDN in `KTV.html`.
- [x] 5.2 Implement `buildIndex(title) -> {full, initials, lower}` and `matchQuery(query, index) -> boolean` for case-insensitive substring matching, in `pinyin-search.jsx`.
- [x] 5.3 Memoize the per-favorite indexes keyed by `(source, videoId, page, title)` so re-renders don't recompute pinyin.

## 6. Frontend UI rework

- [x] 6.1 In `packages/frontend/app-ui.jsx`, replace the side-panel "Queue" header button with a `+` icon button (opens the existing add-link input) and an adjacent 📚 icon button (opens the catalog modal).
- [x] 6.2 Build the catalog modal (`catalog.jsx`): centered dialog with backdrop, search input pinned at the top, list ordered by `added_at` DESC, Esc-to-close + backdrop-click-to-close. Each row shows title / source badge / "+ to queue" action / unstar action.
- [x] 6.3 Wire the modal's "+ to queue" action to `send({type:"queue.add", ref:{source, videoId, page}})` and show a transient confirmation on the row; keep the modal open.
- [x] 6.4 Add a star toggle to every queue row and history row in the side-panel list; bind to the `favorites` store. Empty/filled icon reflects current favorites snapshot.

## 7. Privacy / canonicalization sweep

- [x] 7.1 Grep the backend and frontend for any place that stashes `req.body.url`, `originalUrl`, or `share_text` into state, persisted records, or logs; remove them. (Frontend `urlparse.jsx` no longer attaches `originalUrl: text` to its return shape.)
- [x] 7.2 Confirm by code inspection (and add a unit test) that `Song`/favorite serialization paths only emit the canonical field allowlist.

## 8. Tests

- [x] 8.1 Vitest: parser canonicalization (URL with spm_id_from), `parseRef` round-trip, favorites add/remove dedupe, favorites scoping per owner_key. **11 tests passing.**
- [ ] 8.2 Manual: in two browsers, user A stars in room aaa, joins bbb, sees the star; user B in same room does NOT see A's favorites in their state snapshot.
- [ ] 8.3 Manual: paste the spm-laden Bilibili URL from the user's note, confirm the queued song record contains only canonical fields (inspect via `sqlite3 data/litektv.db 'select state from rooms where slug=?'`).
- [ ] 8.4 Manual: open the catalog modal with a list including `小镇姑娘`, verify `xzgn`, `xiaozhen`, and partial-substring queries all match.

## 9. Ship

- [x] 9.1 Per the project's auto-commit rule, each numbered group landed in its own conventional commit and was pushed immediately. Stage only the files modified for that group — never `git add -A`.
- [ ] 9.2 Run `openspec archive add-favorites` (or `/opsx:archive`) once the manual tests in §8 are verified.
