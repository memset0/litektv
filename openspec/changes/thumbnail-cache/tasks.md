## 1. Schema

- [ ] 1.1 In `packages/backend/src/db.ts` `initDb()`, add `CREATE TABLE IF NOT EXISTS thumbnails (source TEXT NOT NULL, video_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (source, video_id))`
- [ ] 1.2 Export `getThumb(source, videoId)` (returns `{mime, bytes, fetchedAt} | null`) and `putThumb(source, videoId, mime, bytes)` from `db.ts`

## 2. Cache module

- [ ] 2.1 New file `packages/backend/src/thumbnailCache.ts` exporting `getOrFetchThumb(source: "yt"|"bili", videoId: string)` returning `{mime, bytes}`
- [ ] 2.2 Implement YouTube branch: fetch `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg`, validate `image/*` content-type, return bytes
- [ ] 2.3 Implement Bilibili branch: call `api.bilibili.com/x/web-interface/view?bvid=<id>` (or `aid=<id>` for `av*`), read `data.pic`, normalize `http://` → `https://`, fetch, return bytes
- [ ] 2.4 Lazy TTL: if existing row's `fetched_at < now - 30d`, treat as miss and re-fetch (best-effort; on upstream error keep the stale row)
- [ ] 2.5 On upstream 4xx/5xx or non-image content-type, throw an error AND do NOT write a row

## 3. REST endpoint

- [ ] 3.1 In `packages/backend/src/rest.ts`, replace the existing 302-redirect `/api/thumb` handler with one that calls `getOrFetchThumb(source, id)` and streams the bytes back
- [ ] 3.2 Set `content-type` to the cached `mime`; set `cache-control: public, max-age=86400`
- [ ] 3.3 On unknown `source`, respond `400 application/json` with `{error:"bad source"}`
- [ ] 3.4 On upstream failure, respond `502 application/json` with a small error message

## 4. Parser response shape

- [ ] 4.1 In `packages/backend/src/parser.ts`, change `finalizeMeta` (or whichever site assembles the final response) so `thumb` is `\`/api/thumb?source=${source}&id=${videoId}\`` for both `yt` and `bili`, instead of the upstream CDN URL
- [ ] 4.2 Drop the `thumbUrlFor` export if no other call site uses it

## 5. Verify

- [ ] 5.1 `curl -s -X POST -H 'content-type: application/json' -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' https://ktv.dev.mem.ac/api/parse-link` returns `thumb: "/api/thumb?source=yt&id=dQw4w9WgXcQ"`
- [ ] 5.2 First `curl -sI https://ktv.dev.mem.ac/api/thumb?source=yt&id=dQw4w9WgXcQ` → 200 image/jpeg, populates `thumbnails` row (`sqlite3 backend/data/litektv.db "SELECT source, video_id, length(bytes) FROM thumbnails"` shows the row)
- [ ] 5.3 Second `curl -sI ...` → still 200, but no new upstream request (verify by tail of `journalctl -u litektv` or by network observation)
- [ ] 5.4 Bilibili end-to-end: parse a `bilibili.com/video/BV...` URL, then `curl -sI /api/thumb?source=bili&id=<bv>` → 200 image/* with bytes that are NOT empty, served over https
- [ ] 5.5 `systemctl restart litektv && curl -sI /api/thumb?source=yt&id=dQw4w9WgXcQ` → 200 with the same Content-Length as before the restart (cache survived)
- [ ] 5.6 Bad source `curl -sI /api/thumb?source=foo&id=xyz` → 400