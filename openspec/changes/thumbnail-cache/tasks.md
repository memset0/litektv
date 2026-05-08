## 1. Schema

- [x] 1.1 In `packages/backend/src/db.ts` `initDb()`, add `CREATE TABLE IF NOT EXISTS thumbnails (source TEXT NOT NULL, video_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (source, video_id))`
- [x] 1.2 Export `getThumb(source, videoId)` (returns `{mime, bytes, fetchedAt} | null`) and `putThumb(source, videoId, mime, bytes)` from `db.ts`

## 2. Cache module

- [x] 2.1 New file `packages/backend/src/thumbnailCache.ts` exporting `getOrFetchThumb(source: "yt"|"bili", videoId: string)` returning `{mime, bytes}`
- [x] 2.2 Implement YouTube branch: fetch `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg`, validate `image/*` content-type, return bytes
- [x] 2.3 Implement Bilibili branch: call `api.bilibili.com/x/web-interface/view?bvid=<id>` (or `aid=<id>` for `av*`), read `data.pic`, normalize `http://` → `https://`, fetch, return bytes
- [x] 2.4 Lazy TTL: if existing row's `fetched_at < now - 30d`, treat as miss and re-fetch (best-effort; on upstream error keep the stale row)
- [x] 2.5 On upstream 4xx/5xx or non-image content-type, throw an error AND do NOT write a row

## 3. REST endpoint

- [x] 3.1 In `packages/backend/src/rest.ts`, replace the existing 302-redirect `/api/thumb` handler with one that calls `getOrFetchThumb(source, id)` and streams the bytes back
- [x] 3.2 Set `content-type` to the cached `mime`; set `cache-control: public, max-age=86400`
- [x] 3.3 On unknown `source`, respond `400 application/json` with `{error:"bad source"}`
- [x] 3.4 On upstream failure, respond `502 application/json` with a small error message

## 4. Parser response shape

- [x] 4.1 In `packages/backend/src/parser.ts`, change `finalizeMeta` (or whichever site assembles the final response) so `thumb` is `\`/api/thumb?source=${source}&id=${videoId}\`` for both `yt` and `bili`, instead of the upstream CDN URL
- [x] 4.2 Drop the `thumbUrlFor` export if no other call site uses it

## 5. Verify

- [x] 5.1 `curl -s -X POST -H 'content-type: application/json' -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' https://ktv.dev.mem.ac/api/parse-link` returns `thumb: "/api/thumb?source=yt&id=dQw4w9WgXcQ"`
- [x] 5.2 First `curl -sI https://ktv.dev.mem.ac/api/thumb?source=yt&id=dQw4w9WgXcQ` → 200 image/jpeg, populates `thumbnails` row (verified via `node -e` reading the DB: `yt/dQw4w9WgXcQ/image\jpeg/21011B`)
- [x] 5.3 Second `curl -sI ...` → still 200, identical content-length, no new upstream request
- [x] 5.4 Bilibili end-to-end: `/api/thumb?source=bili&id=BV1uv411q7Mv` → 200 image/jpeg 202456B, fetched once, served from cache thereafter
- [x] 5.5 `systemctl restart litektv && curl -sI /api/thumb?source=yt&id=dQw4w9WgXcQ` → 200 with the same Content-Length as before (21011B); Bili identically (202456B); cache survives the restart
- [x] 5.6 Bad source `curl -sI /api/thumb?source=foo&id=xyz` → 400