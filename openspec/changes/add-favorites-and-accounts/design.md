## Context

The current data model treats every interesting state as room-scoped: queue, history, danmaku, presence all live inside a single `RoomState` row in SQLite. The frontend keeps a stable `userId` in `localStorage` (`ME_KEY = "ktv:me"`) but that ID is only used for presence and `addedBy`; nothing follows the user out of the room.

Two product needs push us off that model:

1. People want a "my songs" list that survives room churn. Rooms are GC'd after 24h idle, slugs are easy to lose, and a song's only canonical handle right now is its `(source, videoId, page?)` triple — but that triple lives only inside a room's queue/history.
2. The Bilibili share-button produces URLs like `https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=6f64410c2ccb33424242f5eeeb74eb8c`. Those query params encode session/tracking info that, today, would get stored verbatim if anything ever persisted the raw URL. The parser already extracts `BV1y2q6YWEGp` cleanly, but the contract isn't explicit and a future "store the original link" feature would silently leak the params. We want the canonicalization rule documented and load-bearing now, before favorites makes the leak surface bigger.

Stakeholders are end-users (singers wanting a personal song list) and us as operators (privacy posture, GC predictability). There is no auth infrastructure today; identity is just a UUID in `localStorage`.

## Goals / Non-Goals

**Goals:**

- Per-user favorites list scoped to `userId`, identical across every room that user joins.
- Storage records contain only canonical fields: `source`, `videoId`, `page?`, plus display fields the parser produced (`title`, `thumb?`, `duration?`). Never the raw URL, never tracking params.
- Anonymous users (no account) get a working favorites list keyed by their existing `localStorage` `userId`. Logging in folds that list into the account.
- Catalog drawer searchable by full pinyin, pinyin initials, and case-insensitive substring against song titles.
- UI: side-panel action area shows `+` (add link) and 📚 (catalog) buttons in place of the current "Queue" button.
- Bilibili `page` (`?p=N`) survives the parse → favorite → re-queue round trip so when we add the page-picker later, existing favorites already carry the right index.

**Non-Goals:**

- OAuth / third-party identity providers. Username + (optional) password is enough for v1.
- Real-time multi-device favorites sync beyond best-effort broadcast on the user's own active WebSockets.
- Multi-`p` page-picker UI in the queue/favorites add flow (kept as a follow-up; backend stays compatible).
- Per-favorite tagging, ordering, or playlists. Favorites are an unordered set keyed by `(userId, source, videoId, page)`.
- Migrating already-stored room rows. Existing room JSON is left as-is; canonicalization applies on the next mutation.

## Decisions

### Decision: Favorites are per-user, NOT part of `RoomState`

Favorites ride a separate persistence path (new `favorites` table) and a separate WebSocket message family (`favorite.*`). They are never embedded in the `RoomState` JSON broadcast.

**Why:** Embedding favorites in `RoomState` would (a) leak one user's list to every peer in the room, (b) bloat the broadcast payload, and (c) couple favorites GC to room GC, which is exactly wrong — favorites must outlive rooms.

**Alternatives considered:**
- *Embed in `RoomState.users[userId].favorites`.* Rejected: same broadcast/GC problems.
- *Keep favorites only in `localStorage` per device.* Rejected: violates "same list in every room from any device once logged in".

### Decision: Identity layer is opt-in, anonymous-by-default

Every client still gets a `localStorage` `userId`. That ID is the canonical key for the `favorites` table even before login. Logging in attaches an `accountId` to the same `userId`, and any favorites previously saved under that `userId` belong to the account from then on. A second device logging into the same account reads favorites by `accountId`, then writes through to that same `accountId`-bound `userId` set.

**Why:** Preserves the current frictionless flow ("paste link, sing"); makes login a strict upgrade rather than a precondition; the merge story is dead simple because the local `userId` already keys everything.

**Alternatives considered:**
- *Require login before saving favorites.* Rejected per the user's spec ("允许匿名保存").
- *Two separate stores (anonymous-favorites vs account-favorites) with explicit copy on login.* Rejected: more code, easy to drift.

### Decision: Auth is username + password (argon2id), no email

A user picks a unique `name` (3–24 chars) and a password (≥8 chars). The server stores `argon2id` hash. Sessions are tied to a long-lived opaque token in `localStorage` (`ktv:session`); the token is sent with `auth.login` on the WebSocket and as a `Bearer` on REST. No email verification, no password reset (v1 — losing the password means losing the account; favorites are not load-bearing data).

**Why:** Keeps the surface tiny. We have no mail infra. Argon2id is the modern default. Tokens-in-`localStorage` is acceptable for an internal-style app with no high-value data.

**Alternatives considered:**
- *Magic-link email.* Rejected: requires SMTP infra and adds a new failure mode.
- *Anonymous-only forever.* Rejected: defeats the cross-device requirement.

### Decision: Parser canonicalizes — `URL.searchParams` is filtered to an allowlist

`parseLink` returns and the system only ever stores `{source, videoId, page?}`. The function signature does NOT change, but two new explicit guarantees are added:
- For `bili`, the only param read is `p`; everything else (`spm_id_from`, `vd_source`, `share_source`, `from_spmid`, `is_story_h5`, …) is ignored and never echoed.
- For `yt`, the only param read is `v` (and the path forms `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, `youtu.be/<id>`).

The favorite/queue add path also gains an alternate input shape: `{ref: {source, videoId, page?}, title?, thumb?, duration?}`. When `ref` is supplied, the server SHALL skip URL parsing entirely and only fetch metadata if `title` is missing.

**Why:** Privacy — `spm_id_from` is a Bilibili search-result tracker that ties the session back to a user. Storing it in any persistent record is a leak. Also makes the round-trip (favorite → queue add) cheap and idempotent.

### Decision: SQLite schema additions

```sql
CREATE TABLE accounts (
  account_id    TEXT PRIMARY KEY,           -- uuid
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  emoji         TEXT NOT NULL DEFAULT '🎤',
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);

CREATE TABLE sessions (
  token        TEXT PRIMARY KEY,             -- 32-byte base64url
  account_id   TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);

CREATE TABLE user_links (
  user_id      TEXT PRIMARY KEY,             -- the localStorage UUID
  account_id   TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  linked_at    INTEGER NOT NULL
);

CREATE TABLE favorites (
  owner_key    TEXT NOT NULL,                -- "acct:<account_id>" or "anon:<user_id>"
  source       TEXT NOT NULL,                -- 'yt' | 'bili'
  video_id     TEXT NOT NULL,
  page         INTEGER NOT NULL DEFAULT 0,   -- 0 means "no page" (yt or bili p=1)
  title        TEXT NOT NULL,
  thumb        TEXT,
  duration     INTEGER,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (owner_key, source, video_id, page)
);
CREATE INDEX idx_favorites_owner_added ON favorites(owner_key, added_at DESC);
```

`owner_key` is computed at request time from the connection's auth state: if a session is attached, `acct:<account_id>`; otherwise `anon:<userId>`. On login, all rows with `owner_key = anon:<userId>` are rewritten to `acct:<account_id>` (`INSERT OR IGNORE` then `DELETE` from anon, in a single transaction).

**Why this shape:** A single `owner_key` column keeps the index simple and makes the merge a one-shot SQL statement. `COALESCE(page,0)` lets the primary key be tight without nullable parts. `CASCADE` on `sessions` keeps cleanup easy.

### Decision: Pinyin search runs client-side

The favorites modal is rendered from a `favorites[]` snapshot the client already has, and Chinese-language libraries (`pinyin-pro`, `tiny-pinyin`) are small (~100KB ungzipped). We compute three indexes per row when the favorite list arrives: full pinyin (`小镇姑娘 → xiaozhenguniang`), initials (`xzgn`), and the original lowercase title. A query matches if it is a contiguous substring of any of those.

**Why:** Avoids round-trips on every keystroke. The list is small (≤ a few thousand entries even for power users). Backend stays dumb.

**Alternatives considered:**
- *Server-side fuzzy search (sqlite FTS5 + custom tokenizer).* Rejected as over-engineered for a personal list.

### Decision: UI — `+` and 📚 replace the Queue tab button

The current side-panel "Queue" header button becomes two adjacent icon buttons:

- `+` opens the existing add-link input (no behavior change beyond the icon).
- 📚 (catalog) opens a centered modal dialog (backdrop + Esc-to-close) showing favorites ordered by `added_at` descending, with a search box pinned at the top.

Each queue/history row gets a star toggle on the right edge.

**Why:** Matches the user's spec; a `+` is universally read as "add", and the catalog button is a sibling so the action area stays compact.

## Risks / Trade-offs

- **[Risk]** Favorites broadcast on multiple sockets of the same account can race during rapid add/remove → **Mitigation:** server is the single writer; every mutation re-broadcasts the full per-user list (small payload), client always rerenders from the latest snapshot.
- **[Risk]** Anonymous users clearing `localStorage` lose their favorites silently → **Mitigation:** UI surfaces a "create account to keep these forever" nudge after the favorite count crosses a threshold (e.g. ≥3); not blocking.
- **[Risk]** Username collisions / squatting (no email recovery) → **Mitigation:** v1 ships with manual recovery only ("ask the operator"); document that favorites are not sensitive data.
- **[Risk]** Pinyin library bundle size on slow networks → **Mitigation:** lazy-load the catalog modal module on first open, not on app boot.
- **[Risk]** Existing Bilibili rooms may have stored thumbs whose URLs include tracking-ish suffixes from the API → **Mitigation:** none needed; thumbs are display-only and from `i*.hdslb.com`, not the user's share link. We are only canonicalizing the *input* URL, not third-party-served images.
- **[Trade-off]** Argon2id native module adds a backend dependency → accepted; argon2 npm package is widely used.
- **[Trade-off]** No multi-device live sync of favorites means a user can briefly see a stale list on Device B after starring on Device A (until B reconnects or the next ws message). Acceptable for v1.

## Migration Plan

1. **Schema migration on boot.** `initDb()` runs `CREATE TABLE IF NOT EXISTS` for the four new tables. Existing `rooms` table is untouched.
2. **No backfill of room JSON.** Already-stored room queues remain as-is. We do NOT walk historical rooms to strip URL params from stored `Song` records, because those records were already produced by the parser and never contained raw user URLs in the first place.
3. **Frontend ships behind no flag** — replacing the Queue button is part of the same release. There is no path back to the old single-button UI; if we need to revert we revert the commit.
4. **Rollback:** drop the four new tables, redeploy the previous frontend bundle. Favorites data is non-load-bearing, so loss on rollback is acceptable.

## Open Questions

- Do we want a "starred by N other people in this room" hint on rows? (Cheap once favorites exist; defer unless asked.)
- Should the catalog drawer support "play next" vs "add to end" as separate actions? Defaulting to "add to end" matches today's queue.add semantics.
- Long-lived session tokens never expire in this design. Add a 90-day idle expiry? Probably yes but trivial to add later.
