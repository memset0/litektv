## Context

The current data model treats every interesting state as room-scoped: queue, history, danmaku, presence all live inside a single `RoomState` row in SQLite. The frontend keeps a stable `userId` in `localStorage` (`ME_KEY = "ktv:me"`) but that ID is only used for presence and `addedBy`; nothing follows the user out of the room.

Two product needs push us off that model:

1. People want a "my songs" list that survives room churn. Rooms are GC'd after 24h idle, slugs are easy to lose, and a song's only canonical handle right now is its `(source, videoId, page?)` triple — but that triple lives only inside a room's queue/history.
2. The Bilibili share-button produces URLs like `https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=6f64410c2ccb33424242f5eeeb74eb8c`. Those query params encode session/tracking info that, today, would get stored verbatim if anything ever persisted the raw URL. The parser already extracts `BV1y2q6YWEGp` cleanly, but the contract isn't explicit and a future "store the original link" feature would silently leak the params. We want the canonicalization rule documented and load-bearing now, before favorites makes the leak surface bigger.

Stakeholders are end-users (singers wanting a personal song list) and us as operators (privacy posture, GC predictability). Identity is just a UUID in `localStorage` — and per the user's directive, we are intentionally **not** building an account/login layer on top.

## Goals / Non-Goals

**Goals:**

- A single **site-wide** favorites list shared by every visitor. One global pool of starred songs persisted in SQLite.
- Each favorite row records the **first starrer** as `addedBy = {id, name, emoji}` so the catalog modal shows who added it. The server stamps this from presence — clients can't spoof.
- Re-queueing from the catalog (or replaying from history) stamps the **current user** as the queue's `addedBy`, so the queue always reflects who's queueing right now, not who originally added the song.
- Storage records contain only canonical fields: `source`, `videoId`, `page?`, plus display fields the parser produced (`title`, `thumb?`, `duration?`). Never the raw URL, never tracking params.
- Catalog modal searchable by full pinyin, pinyin initials, and case-insensitive substring against song titles.
- UI: side-panel action area shows `+` (add link) and 📚 (catalog) buttons in place of the current "Queue" button. The catalog modal is centered, list ordered by `added_at` DESC, Esc / backdrop click closes.
- Bilibili `page` (`?p=N`) survives the parse → favorite → re-queue round trip so when we add the page-picker later, existing favorites already carry the right index.

**Non-Goals:**

- **Any account / login / password system.** Identity for presence/`addedBy` stays the existing `localStorage` `userId` plus the freely-set `name`/`emoji` profile.
- Per-user or private favorites — every favorite is public. There is no scoping. Anyone can star.
- **Removing a song from favorites.** Add-only in v1; the user explicitly deferred unstar. Catalog modal has no remove button and the star toggle disables itself once filled.
- Multi-`p` page-picker UI in the queue/favorites add flow (kept as a follow-up; backend stays compatible).
- Per-favorite tagging, ordering, or playlists. Favorites are an unordered set keyed by `(source, videoId, page)`, surfaced in `added_at DESC` order.
- Migrating already-stored room rows. Existing room JSON is left as-is; canonicalization applies on the next mutation.

## Decisions

### Decision: Favorites are GLOBAL, NOT part of `RoomState`

Favorites ride a separate persistence path (new `favorites` table) and a separate WebSocket message family (`favorite.*`). They are never embedded in the `RoomState` JSON broadcast. The favorites set is a single site-wide pool — every connected client sees the same list.

**Why:** Embedding favorites in `RoomState` would (a) bloat the broadcast payload, (b) couple favorites GC to room GC (favorites must outlive rooms), and (c) artificially scope a fundamentally site-wide concept to a single room.

### Decision: One global pool, no per-user partitioning

The `favorites` table has no `owner_key` column. PK is `(source, video_id, page)`. First-starrer wins on conflict; subsequent stars of the same song are no-ops. Anyone may unstar.

**Why:** Per the user's directive, favorites are explicitly public. Per-user lists or visibility scopes would require an identity layer the project has chosen not to build.

### Decision: Add-only in v1 (no unstar / remove)

The favorites WebSocket family ships with `favorite.add` and `favorite.list` only. There is no `favorite.remove` message and no `removeFavorite` DB accessor. The catalog modal renders a single "+ to queue" action per row. The star toggle on queue/history rows is `disabled` once filled (with a `已收藏` tooltip) so it's clear that the action is irreversible for now.

**Why:** The user explicitly deferred unstar — favorites are still a young feature and the product hasn't yet decided on the semantics ("anyone can unstar?" leans noisy; "only the favoriter can unstar?" leans like accounts). Shipping add-only keeps the surface tiny and avoids painting ourselves into a corner. If/when removal is wanted, it's a small additive change (one WS handler, one DB delete, one UI button).

### Decision: `addedBy` is server-stamped from presence

The `addedBy` field on a favorite row is set by the server from the connection's known presence (`name` + `emoji` from the room presence map, plus the connection's `userId`). The client's `favorite.add` payload SHALL NOT carry an `addedBy` — even if it does (via `.strict()` rejecting unknown fields it can't), the server would ignore it.

**Why:** Anyone could pose as anyone if the client controlled `addedBy`. Stamping it server-side is cheap and correct.

### Decision: Parser canonicalizes — `URL.searchParams` is filtered to an allowlist

`parseLink` returns and the system only ever stores `{source, videoId, page?}`. Two explicit guarantees:
- For `bili`, the only param read is `p`; everything else (`spm_id_from`, `vd_source`, `share_source`, `from_spmid`, `is_story_h5`, …) is ignored and never echoed.
- For `yt`, the only param read is `v` (and the path forms `/shorts/<id>`, `/embed/<id>`, `/live/<id>`, `youtu.be/<id>`).

The favorite/queue add path also gains an alternate input shape: `{ref: {source, videoId, page?}, title?, thumb?, duration?}`. When `ref` is supplied, the server SHALL skip URL parsing entirely and only fetch metadata if `title` is missing.

**Why:** Privacy — `spm_id_from` is a Bilibili search-result tracker that ties the session back to a user. Storing it in any persistent record is a leak. Also makes the round-trip (favorite → queue add) cheap and idempotent.

### Decision: SQLite schema addition

```sql
CREATE TABLE favorites (
  source         TEXT NOT NULL,
  video_id       TEXT NOT NULL,
  page           INTEGER NOT NULL DEFAULT 0,   -- 0 means "no page"
  title          TEXT NOT NULL,
  thumb          TEXT,
  duration       INTEGER,
  added_by_id    TEXT,
  added_by_name  TEXT,
  added_by_emoji TEXT,
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (source, video_id, page)
);
CREATE INDEX idx_favorites_added ON favorites(added_at DESC);
```

PK is global, `addedBy` is denormalized into three columns to keep things simple, the index on `added_at DESC` is the single sort the catalog uses.

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

- **[Risk]** No way to remove a misclicked or low-quality star without a manual DB intervention → **Mitigation:** accepted for v1 as the cost of deferring unstar. If the global list gets meaningfully noisy before remove ships, the operator can `DELETE FROM favorites WHERE …` directly.
- **[Risk]** A noisy / abusive client could spam the global list → **Mitigation:** existing 60/min favorite rate limit per `userId`; if needed we can add a hard cap on total entries.
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
