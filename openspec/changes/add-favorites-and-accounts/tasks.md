## 1. Backend storage scaffolding

- [x] 1.1 In `packages/backend/src/db.ts`, add idempotent `CREATE TABLE IF NOT EXISTS` for `accounts`, `sessions`, `user_links`, and `favorites` with the schema from the room-persistence spec; add `idx_favorites_owner_added`.
- [x] 1.2 Add typed accessors in `db.ts`: `insertAccount`, `findAccountByName`, `getAccountById`, `createSession`, `findSessionByToken`, `deleteSession`, `getOrCreateUserLink`, `linkUserToAccount`, `unlinkUser`, plus `listFavorites(ownerKey)`, `addFavorite(row)`, `removeFavorite(ownerKey, source, videoId, page)`, and `mergeAnonFavoritesIntoAccount(userId, accountId)` (single-tx).
- [x] 1.3 Extend `packages/backend/src/types.ts` with `Account`, `Session`, `Favorite`, `OwnerKey` (`acct:${string}` | `anon:${string}`), and the new WS message shapes (`auth.*`, `favorite.*`).
- [x] 1.4 Add `argon2` to `packages/backend/package.json` and import in a new `packages/backend/src/auth.ts` exposing `hashPassword`, `verifyPassword`, `mintToken`.

## 2. Backend parser canonicalization

- [x] 2.1 In `packages/backend/src/parser.ts`, audit `parseYouTube` and `parseBilibili` to confirm they only read the allowlisted query params (`v`, `p`); add a comment block at the top of the file declaring the allowlist as load-bearing for privacy.
- [x] 2.2 Add an exported `parseRef(ref: NormalizedRef): Promise<ParsedSongMeta>` that skips URL extraction/redirect resolution and only runs the metadata fetch path.
- [x] 2.3 Update `/api/parse-link` in `packages/backend/src/rest.ts` to accept either `{url}` or `{ref}` and dispatch to `parseLink`/`parseRef` accordingly; reject payloads carrying both.
- [x] 2.4 Add a regression test (vitest, new `packages/backend/src/parser.test.ts`) asserting that the spm/vd_source/etc-laden Bilibili URL produces output with no extra fields and that `parseRef` doesn't hit the redirect resolver.

## 3. Backend auth + session handling

- [ ] 3.1 Implement WS message handlers in `packages/backend/src/ws.ts`: `auth.signup`, `auth.login`, `auth.attach`, `auth.logout`, `auth.profile`, each responding `{type:"auth.ok", token?, account}` on success and `{type:"error", error}` on failure.
- [ ] 3.2 Track per-connection state `{userId, accountId?, ownerKey, sessionToken?}`; recompute `ownerKey` on login/logout/attach and emit a `favorites` snapshot on every `ownerKey` transition.
- [ ] 3.3 Override presence `name`/`emoji` and `addedBy` for connections with an attached account so account identity wins over the hello fields (per user-accounts spec).
- [ ] 3.4 Add REST `POST /api/auth/signup` and `POST /api/auth/login` returning `{token, account}` with the same shape; share validation/hash logic with the WS handlers.
- [ ] 3.5 Implement per-name+IP and per-IP rate limits for auth in `packages/backend/src/rateLimit.ts`.

## 4. Backend favorites handling

- [ ] 4.1 Implement WS handlers `favorite.add`, `favorite.remove`, `favorite.list` in `ws.ts`. `favorite.add` SHALL accept `{song:{source, videoId, page?, title?, thumb?, duration?}}` and call `parseRef` to fill in missing metadata.
- [ ] 4.2 After every successful favorite mutation, send `{type:"favorites", favorites}` to every WS whose current `ownerKey` matches the mutator's.
- [ ] 4.3 On every successful `hello`, `auth.attach`, `auth.login`, and `auth.logout`, send a fresh `favorites` snapshot ordered by `added_at DESC`.
- [ ] 4.4 Extend `queue.add` to accept `{ref:{source, videoId, page?}}` (in addition to the legacy `{song}` shape); on the `ref` path, look up cached favorite metadata first, falling back to `parseRef`.
- [ ] 4.5 Add the favorites combined rate limit (`60/min` per `ownerKey`).

## 5. Frontend identity + favorites store

- [ ] 5.1 In `packages/frontend/state.jsx`, extend `me` with `accountId?`, `sessionToken?`; persist `sessionToken` under a new key (`ktv:session`) separate from `ktv:me`.
- [ ] 5.2 Add a `favorites` store in `state.jsx` that subscribes to `{type:"favorites"}` messages and exposes `useFavorites()` plus `addFavorite(song)` / `removeFavorite(song)` helpers.
- [ ] 5.3 Add `useAuth()` exposing `signup({name, password, emoji})`, `login({name, password})`, `logout()`, `updateProfile({name?, password?, emoji?})`, all routed through the existing WS connection.
- [ ] 5.4 On WS `open`, automatically send `{type:"auth.attach", token}` if a session token is in `localStorage`; on `auth.ok` update `me` accordingly.

## 6. Frontend pinyin search helper

- [ ] 6.1 Add `pinyin-pro` (or equivalent, evaluated at impl time for bundle size) to the frontend; lazy-load it from the catalog modal entry point so app boot is unaffected.
- [ ] 6.2 Implement `buildSearchIndex(title) -> {full, initials, lower}` and `matchQuery(query, index) -> boolean` for case-insensitive substring matching.
- [ ] 6.3 Memoize the per-favorite indexes keyed by `(source, videoId, page)` so re-renders don't recompute pinyin.

## 7. Frontend UI rework

- [ ] 7.1 In `packages/frontend/app-ui.jsx`, replace the side-panel "Queue" header button with a `+` icon button (opens the existing add-link input) and an adjacent 📚 icon button (opens the catalog modal). Remove any leftover "Queue" label styles in `ktv.css` / `ktv-extras.css`.
- [ ] 7.2 Build the catalog modal: centered dialog with backdrop, search input pinned at the top, list ordered by `added_at` DESC, Esc-to-close + backdrop-click-to-close. Each row shows title / source badge / "+ to queue" action / unstar action.
- [ ] 7.3 Wire the modal's "+ to queue" action to `send({type:"queue.add", ref:{source, videoId, page}})` and show a transient confirmation on the row; keep the modal open.
- [ ] 7.4 Add a star toggle to every queue row and history row in the side-panel list; bind to the `favorites` store. Empty/filled icon reflects current favorites snapshot.
- [ ] 7.5 Add a minimal auth UI (login / signup / logout / profile-edit form) reachable from the existing identity area; show "create an account to keep your favorites forever" nudge once anonymous favorite count ≥3.

## 8. Privacy / canonicalization sweep

- [ ] 8.1 Grep the backend and frontend for any place that stashes `req.body.url`, `originalUrl`, or `share_text` into state, persisted records, or logs; remove them.
- [ ] 8.2 Confirm by code inspection (and add a unit test) that `Song`/favorite serialization paths only emit the canonical field allowlist.

## 9. Tests + manual verification

- [ ] 9.1 Vitest: parser canonicalization (URL with spm_id_from), `parseRef` round-trip, favorites add/remove dedupe, anonymous→account merge transactionality (kill mid-tx via `BEGIN IMMEDIATE` + thrown error).
- [ ] 9.2 Manual: in two browsers, anonymous user A stars in room aaa, joins bbb, sees the star; user B in same room does NOT see A's favorites in their state snapshot.
- [ ] 9.3 Manual: signup on Device 1, login same account on Device 2, observe favorites appear; star on D2, observe live broadcast on D1 within one round trip.
- [ ] 9.4 Manual: paste the spm-laden Bilibili URL from the user's note, confirm the queued song record contains only canonical fields (inspect via `sqlite3 data/litektv.db 'select state from rooms where slug=?'`).
- [ ] 9.5 Manual: open the catalog modal with a list including `小镇姑娘`, verify `xzgn`, `xiaozhen`, and partial-substring queries all match.

## 10. Ship

- [ ] 10.1 Per the project's auto-commit rule, commit each numbered group as it lands (e.g. `feat(backend): add favorites + accounts schema`, `feat(parser): canonicalize URLs and accept refs`, `feat(ws): favorites + auth handlers`, `feat(frontend): catalog modal + star toggles`) and push immediately. Stage only the files modified for that group — never `git add -A`.
- [ ] 10.2 Run `openspec archive add-favorites-and-accounts` (or `/opsx:archive`) once the apply phase is complete and verified.
