## Context

Today: parser response carries `thumb` = the upstream CDN URL (or `null`). Frontend doesn't render thumbs anywhere right now (we removed them from queue/history rows on user request), but the field is still in the song record and may come back to a UI surface (favorites catalog, share preview, now-playing card).

The blocker for resurrecting thumbs: Bilibili's API gives `http://i*.hdslb.com/...` and the SPA is served over HTTPS, so the browser blocks the image as mixed content. The same path works fine over HTTPS — Bilibili just hasn't updated their API to advertise it. Beyond that scheme issue, hot-linking from the browser also leaks viewer IPs to ytimg / hdslb on every queue render.

A backend cache is the right place to centralize all of this:

- Scheme normalization (rewrite `http://` → `https://`).
- Resilience to CDN policy changes.
- Privacy.
- Single fetch per cover regardless of how many viewers see it.

## Goals / Non-Goals

**Goals:**
- `GET /api/thumb?source=&id=` always works from the SPA, no mixed-content, no per-user CDN fan-out.
- Covers persist alongside room state — one DB file, one TTL, one backup.
- First fetch is the only upstream fetch; subsequent fetches across all rooms / users come from SQLite.
- The parser's `thumb` field becomes a same-origin URL.

**Non-Goals:**
- We are NOT building image transforms (resize, compress, convert). The proxy serves the same bytes the upstream returned.
- We are NOT serving thumbs for arbitrary URLs — only canonical YouTube `videoId` and Bilibili `BV.../av...` ids.
- We are NOT migrating songs already in SQLite to point at `/api/thumb`. They keep their old (or null) `thumb` URLs; nobody renders them today, and any future UI work will use the new parser output for new songs.
- No CDN of our own, no signed URLs, no auth on `/api/thumb` — covers are public on YouTube/Bilibili anyway.

## Decisions

**Store image bytes as a SQLite BLOB in the existing `litektv.db`** instead of as files under `data/thumbs/`.

- Why: one persistence unit. The user already has one mental model (`/root/yulun/litektv/backend/data/litektv.db`) for "the durable state of the room". A backup of that file restores everything, including covers. A separate filesystem cache means a possible drift after a restore (DB has rows that point at missing files, or vice-versa).
- Cost: SQLite handles BLOBs well at this size (covers are typically 30–200KB; YT `hqdefault` is ~30KB, Bili `pic` is ~50KB). 1000 cached covers ≈ <100MB. Acceptable.
- Alternative considered: filesystem under `data/thumbs/`. Rejected per above.

**Pick a single canonical size per source** instead of size variants.

- YouTube: `hqdefault.jpg` (480×360, always exists, tiny). We don't try `maxresdefault` because for some videos it returns 404.
- Bilibili: whatever `data.pic` returns (usually a 16:9 JPEG/PNG ~50KB).
- Why: simpler cache key, single fetch per id. If a future surface wants different sizes, we add a `?size=` param later.

**Parser response uses a relative URL**: `thumb: "/api/thumb?source=...&id=..."` (no host).

- Why: same-origin from the SPA; trivially correct in dev (`http://127.0.0.1:38117`) and prod (`https://ktv.dev.mem.ac`); no need to know the public hostname at parse time.
- Alternative: emit absolute URLs. Rejected — adds config dependency on `PUBLIC_BASE_URL` for no real benefit.

**Lazy TTL of 30 days**, no cron, no size cap.

- Why: covers are effectively immutable per id (Bilibili pic URL is content-hash based; YouTube changes thumbs only on uploader edit). 30 days is just an upper bound on staleness for the rare uploader edit. Skipping cron + size cap keeps the implementation tiny.
- If the table ever blows up, a future `chore: prune thumbnails` task can add a one-shot cleanup.

## Risks / Trade-offs

- [Risk] BLOB storage bloats the SQLite WAL → Mitigation: occasional `VACUUM` if needed; covers are small enough that for the foreseeable scale this is non-issue.
- [Risk] Bilibili changes `data.pic` shape, breaks our resolver → Mitigation: same risk applies to today's parser; if `pic` disappears, the cache returns `502` and we fix the resolver.
- [Trade-off] We pay a single backend round-trip even for cached covers (vs. a 302 redirect to the CDN). Acceptable — same-origin, gzip is moot for JPEG, and the bytes-proxy avoids the privacy / mixed-content problems.

## Migration Plan

- Add the table via `CREATE TABLE IF NOT EXISTS` in `initDb()`. Idempotent; deploys older than this change are a no-op next restart.
- The deploy is purely backend: rebuild + `systemctl restart litektv`. No frontend rebuild required.
- Songs already in `rooms.state.queue / history / current` keep whatever `thumb` field they have. The next time a user pastes the same link, the parser response will use the new proxy URL and re-queueing rebuilds the song with the new shape.
