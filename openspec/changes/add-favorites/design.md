## Context

The current data model treats every interesting state as room-scoped: queue, history, danmaku, presence all live inside a single `RoomState` row in SQLite. The frontend keeps a stable `userId` in `localStorage` (`ME_KEY = "ktv:me"`) but that ID is only used for presence and `addedBy`; nothing follows the user out of the room.

Two product needs push us off that model:

1. People want a "my songs" list that survives room churn. Rooms are GC'd after 24h idle, slugs are easy to lose, and a song's only canonical handle right now is its `(source, videoId, page?)` triple — but that triple lives only inside a room's queue/history.
2. The Bilibili share-button produces URLs like `https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=6f64410c2ccb33424242f5eeeb74eb8c`. Those query params encode session/tracking info that, today, would get stored verbatim if anything ever persisted the raw URL. The parser already extracts `BV1y2q6YWEGp` cleanly, but the contract isn't explicit and a future "store the original link" feature would silently leak the params. We want the canonicalization rule documented and load-bearing now, before favorites makes the leak surface bigger.

Stakeholders are end-users (singers wanting a personal song list) and us as operators (privacy posture, GC predictability). Identity is just a UUID in `localStorage` — and per the user's directive, we are intentionally **not** building an account/login layer on top.

## Goals / Non-Goals

**Goals:**

- Per-user favorites list scoped to the `localStorage` `userId`, identical across every room that user joins from the same browser.
- Storage records contain only canonical fields: `source`, `videoId`, `page?`, plus display fields the parser produced (`title`, `thumb?`, `duration?`). Never the raw URL, never tracking params.
- Catalog modal searchable by full pinyin, pinyin initials, and case-insensitive substring against song titles.
- UI: side-panel action area shows `+` (add link) and 📚 (catalog) buttons in place of the current "Queue" button. The catalog modal is centered, list ordered by `added_at` DESC, Esc / backdrop click closes.
- Bilibili `page` (`?p=N`) survives the parse → favorite → re-queue round trip so when we add the page-picker later, existing favorites already carry the right index.

**Non-Goals:**

- **Any account / login / password system.** Identity is the existing `localStorage` `userId` plus the existing `name`/`emoji` profile sheet. Wiping `localStorage` loses the favorites — that's accepted.
- Multi-device sync. Same browser → same list; different browser is a different list.
- Multi-`p` page-picker UI in the queue/favorites add flow (kept as a follow-up; backend stays compatible).
- Per-favorite tagging, ordering, or playlists. Favorites are an unordered set keyed by `(userId, source, videoId, page)`, surfaced in `added_at DESC` order.
- Migrating already-stored room rows. Existing room JSON is left as-is; canonicalization applies on the next mutation.

## Decisions

### Decision: Favorites are per-`userId`, NOT part of `RoomState`

Favorites ride a separate persistence path (new `favorites` table) and a separate WebSocket message family (`favorite.*`). They are never embedded in the `RoomState` JSON broadcast.

**Why:** Embedding favorites in `RoomState` would (a) leak one user's list to every peer in the room, (b) bloat the broadcast payload, and (c) couple favorites GC to room GC, which is exactly wrong — favorites must outlive rooms.

### Decision: Owner key is `anon:<userId>` (no account form)

The favorites table's `owner_key` column always carries the prefix `anon:` followed by the client's `localStorage` `userId`. There is no `acct:` form, no account table, no session table, no merge logic. If a user wants to "follow them across devices" they have to manually re-star — that is the explicit product trade-off.

**Why:** Username/password infrastructure is operationally heavy (we have no email infra, no recovery story, and the user has explicitly said they don't want one). The existing per-browser stable userId is a reasonable identity for this scope.

### Decision: Parser canonicalizes — `URL.searchParams` is filtered to an allowlist

`parseLink` returns and the system only ever stores `{source, videoId, page?}`. Two explicit guarantees:
- For `bili`, the only param read is `p`; everything else (`spm_id_from`, `vd_source`, `share_source`, `from_spmid`, `is_story_h5`, …) is ignored and never echoed.
- For `yt`, the only param read is `v` (and the path forms `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, `youtu.be/<id>`).

The favorite/queue add path also gains an alternate input shape: `{ref: {source, videoId, page?}, title?, thumb?, duration?}`. When `ref` is supplied, the server SHALL skip URL parsing entirely and only fetch metadata if `title` is missing.

**Why:** Privacy — `spm_id_from` is a Bilibili search-result tracker that ties the session back to a user. Storing it in any persistent record is a leak. Also makes the round-trip (favorite → queue add) cheap and idempotent.

### Decision: SQLite schema addition

```sql
CREATE TABLE favorites (
  owner_key    TEXT NOT NULL,                -- "anon:<userId>"
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

`owner_key` is computed at request time from the connection's `userId` (`anon:<userId>`). `COALESCE(page,0)` lets the primary key be tight without nullable parts.

### Decision: Pinyin search runs client-side

The favorites modal is rendered from a `favorites[]` snapshot the client already has, and Chinese-language libraries (`pinyin-pro`) are small (~100KB ungzipped). We compute three indexes per row when the favorite list arrives: full pinyin (`小镇姑娘 → xiaozhenguniang`), initials (`xzgn`), and the original lowercase title. A query matches if it is a contiguous substring of any of those.

**Why:** Avoids round-trips on every keystroke. The list is small (≤ a few thousand entries even for power users). Backend stays dumb.

### Decision: UI — `+` and 📚 replace the Queue tab button

The current side-panel "Queue" header button becomes two adjacent icon buttons:

- `+` opens the existing add-link input (no behavior change beyond the icon).
- 📚 (catalog) opens a centered modal dialog (backdrop + Esc-to-close) showing favorites ordered by `added_at` descending, with a search box pinned at the top.

Each queue/history row gets a star toggle on the right edge.

**Why:** Matches the user's spec; a `+` is universally read as "add", and the catalog button is a sibling so the action area stays compact.

## Risks / Trade-offs

- **[Risk]** User clears `localStorage` → favorites list disappears with no recovery path → **Mitigation:** none. Documented as the explicit cost of "no accounts". The list is curated convenience, not load-bearing data.
- **[Risk]** Same person on two browsers / two devices sees two different lists → **Mitigation:** none. Out of scope per the user's directive.
- **[Risk]** Pinyin library bundle size on slow networks → **Mitigation:** keep the script tag near the end of `<head>` so it doesn't block first paint.
- **[Risk]** Existing Bilibili rooms may have stored thumbs whose URLs include tracking-ish suffixes from the API → **Mitigation:** none needed; thumbs are display-only and from `i*.hdslb.com`, not the user's share link. We are only canonicalizing the *input* URL, not third-party-served images.

## Migration Plan

1. **Schema migration on boot.** `initDb()` runs `CREATE TABLE IF NOT EXISTS` for the new `favorites` table. Existing `rooms` table is untouched.
2. **No backfill of room JSON.** Already-stored room queues remain as-is. Their `Song` records were already produced by the parser and never contained raw user URLs in the first place.
3. **Frontend ships behind no flag** — replacing the Queue button is part of the same release.
4. **Rollback:** drop the `favorites` table, redeploy the previous frontend bundle. Favorites data is non-load-bearing, so loss on rollback is acceptable.

## Open Questions

- Long-running fav list: do we need pagination once a user has hundreds of entries? Probably not for now; the modal is virtualized-friendly already.
- Should the catalog modal expose "play next" vs "add to end" as separate actions? Defaulting to "add to end" matches today's queue.add semantics.
