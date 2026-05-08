# thumbnail-cache Specification

## Purpose
TBD - created by archiving change thumbnail-cache. Update Purpose after archive.
## Requirements
### Requirement: GET /api/thumb proxies covers and caches them in SQLite

The backend SHALL expose `GET /api/thumb?source=<yt|bili>&id=<videoId>`:

- The endpoint SHALL respond `200` with the cached image bytes and the original `content-type` (e.g. `image/jpeg`, `image/png`) plus `cache-control: public, max-age=86400`.
- On a cache hit, bytes SHALL be read from the SQLite `thumbnails` row WITHOUT making any upstream HTTP call.
- On a miss, the backend SHALL resolve the upstream URL, fetch it once, upsert into `thumbnails`, then serve.
- The cache key SHALL be `(source, videoId)`. Bilibili multipart `page` does NOT vary the cover, so it is not in the key.

#### Scenario: First request for a YouTube cover

- **WHEN** a client calls `GET /api/thumb?source=yt&id=dQw4w9WgXcQ` and the cache is cold
- **THEN** the backend SHALL fetch `https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg`, INSERT a `thumbnails` row with `(source="yt", video_id="dQw4w9WgXcQ", mime="image/jpeg", bytes=<jpg bytes>, fetched_at=<now>)`, and respond `200 image/jpeg` with the bytes and a `cache-control: public, max-age=86400` header

#### Scenario: Second request for the same cover

- **WHEN** another client calls the same `GET /api/thumb?source=yt&id=dQw4w9WgXcQ` after the cache is populated
- **THEN** the backend SHALL `SELECT bytes, mime FROM thumbnails WHERE source=? AND video_id=?`, serve those bytes, AND make NO upstream HTTP call

### Requirement: Bilibili covers are resolved via the existing view API and normalized to HTTPS

When the cache is cold for a Bilibili id, the backend SHALL look up the upstream cover URL via `api.bilibili.com/x/web-interface/view?bvid=<id>` (or `aid=<id>` for `av` ids), read `data.pic`, replace any `http://` scheme with `https://`, and fetch from there. Other Bilibili lookups (parser metadata) MAY share the same fetch.

#### Scenario: Bilibili API returns http:// pic

- **WHEN** a client requests `/api/thumb?source=bili&id=BV1uv411q7Mv`, the cache is cold, and `data.pic` comes back as `http://i2.hdslb.com/.../xyz.jpg`
- **THEN** the backend SHALL fetch `https://i2.hdslb.com/.../xyz.jpg` (HTTPS) and cache the bytes

### Requirement: Cache rows live in the same SQLite database as room state

The cache SHALL be stored in a `thumbnails` table inside the existing `litektv.db`:

```sql
CREATE TABLE IF NOT EXISTS thumbnails (
  source     TEXT NOT NULL,
  video_id   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (source, video_id)
);
```

Schema migration SHALL run on startup (the existing `initDb()` path), idempotent via `IF NOT EXISTS`. The cache MUST survive backend restarts identically to how room state survives — same DB file, same backup unit. There SHALL be no separate filesystem directory; nothing under `data/thumbs/` is required.

#### Scenario: Restart preserves the cache

- **WHEN** the backend has populated some cover bytes for `(yt, dQw4w9WgXcQ)` and `(bili, BV1uv411q7Mv)` and is then restarted
- **THEN** the next `GET /api/thumb?...` for either id SHALL serve from the existing `thumbnails` row WITHOUT any upstream fetch

### Requirement: Best-effort eviction

The cache SHALL be best-effort. Rows older than 30 days (`now - fetched_at > 30d`) MAY be re-fetched on access (lazy TTL); there is no required cron and no required size cap. A failed upstream fetch SHALL NOT poison the cache (no zero-byte rows); the request returns `502` and the next attempt re-fetches.

#### Scenario: Upstream returns 5xx

- **WHEN** the upstream fetch for a cold cache returns `503` or fails to connect
- **THEN** the backend SHALL respond `502` with a small JSON error AND SHALL NOT INSERT any row into `thumbnails`; a retry shortly after SHALL try the upstream again

### Requirement: Unknown source rejects with 400

The endpoint SHALL only accept `source` values `yt` and `bili`. Other values return `400 Bad Request` JSON.

#### Scenario: Bad source

- **WHEN** the request is `GET /api/thumb?source=spotify&id=anything`
- **THEN** the backend SHALL respond `400 application/json` with `{ "error": "bad source" }` and not touch the cache

