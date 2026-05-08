## Why

We dropped queue/history thumbnails earlier because Bilibili pic URLs come back as `http://i*.hdslb.com/...` and were getting blocked as mixed content on our HTTPS page. Now there's a real chance covers come back to a UI surface (favorites catalog, now-playing card, share previews) and we want a clean answer instead of papering over it again. Quick research:

- **YouTube** (`i.ytimg.com`): HTTPS, `Access-Control-Allow-Origin: *`, all five size variants (`default` / `mq` / `hq` / `sd` / `maxresdefault`) return 200, `cache-control: public, max-age=7200`. Hot-linkable from the browser as-is.
- **Bilibili** (`i*.hdslb.com`): API field `data.pic` points to `http://...`, but the same path works perfectly fine over `https://...` (`Access-Control-Allow-Origin: *`, `cache-control: max-age=31536000`). The mixed-content blocker is purely the scheme in the parser response, not the CDN.

So both providers expose usable cover URLs. The minimum fix is rewriting Bilibili's `http://` → `https://`. Beyond that, we still want a backend cache because:

1. **Resilience**: if Bilibili tightens hot-link rules, our queue stays intact.
2. **Privacy**: viewers don't leak their IP to ytimg / hdslb just by looking at a queue.
3. **Once-and-cached**: a popular cover gets fetched at most once across the whole room (and across rooms).

## What Changes

- Introduce a backend thumbnail proxy + **SQLite-BLOB cache** served at `GET /api/thumb?source=<yt|bili>&id=<videoId>`.
  - On a cache hit, the backend reads the bytes from a `thumbnails` row in the existing SQLite database and serves them with a long `cache-control` header.
  - On a miss, it resolves the upstream URL (YouTube → `i.ytimg.com/vi/<id>/hqdefault.jpg`; Bilibili → `data.pic` from the existing view-API call, scheme normalized to `https`), fetches, upserts the row, then serves.
  - Storing in SQLite (not on disk) keeps the cache inside the same persistence unit as room state — one DB file to back up, one TTL/eviction to reason about, no filesystem-vs-DB drift after a restore.
- Parser response (`POST /api/parse-link`) now returns `thumb: "/api/thumb?source=...&id=..."` — a same-origin proxy URL — instead of the upstream CDN URL. Single source of truth, no mixed-content risk, no per-user CDN fan-out.
- Drop the existing 302-redirect `/api/thumb` (returns 302 to `i.ytimg.com`) in favor of the new bytes-proxy version. The query shape `?source=&id=` stays the same.
- Frontend doesn't need to change for this propose — it currently doesn't render thumbs, but when it does, it'll just hit `/api/thumb?...` from the song record.

## Capabilities

### New Capabilities

- `thumbnail-cache`: server-side cache + proxy for YouTube and Bilibili cover images, served at `/api/thumb`, persisted as BLOB rows in the same SQLite database as room state.

### Modified Capabilities

- `link-parser`: parser response replaces the upstream CDN `thumb` URL with a same-origin `/api/thumb?source=...&id=...` URL. The metadata-fetch behavior is unchanged; only the URL shape changes.

## Impact

- Affected code: `packages/backend/src/parser.ts` (drop CDN URL from response, replace with proxy URL), `packages/backend/src/rest.ts` (rewrite `/api/thumb`), `packages/backend/src/db.ts` (new `thumbnails` table + read/upsert helpers), new `packages/backend/src/thumbnailCache.ts`.
- Affected data: a new `thumbnails (source TEXT, video_id TEXT, mime TEXT, bytes BLOB, fetched_at INTEGER, PRIMARY KEY (source, video_id))` table inside the existing `litektv.db`.
- No frontend changes.
- Backwards compatibility: songs already in SQLite carry the old CDN URL in `song.thumb`. Either we leave them alone (UI ignores thumbs today) or run a one-time migration. We choose **leave alone** — they're harmless string fields and the UI doesn't render them.
