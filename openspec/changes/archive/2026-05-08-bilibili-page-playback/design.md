## Context

Today the chain looks like this:

1. User pastes `…/BV1ir4y1u7om?p=2` (often with messy share params).
2. Backend `parser.ts::parseBilibili` reads `searchParams.get("p")` and returns `{source:"bili", videoId, page:2}`.
3. Backend `fetchBilibiliMeta(videoId, 2)` looks up the matching entry in `data.pages` and returns the per-page title (e.g. `"… - P2 上半场"`) and duration.
4. Frontend `parseAddSong` receives `{source, videoId, page:2, title, …}`, `AddSongInput` packs all of them into a song, and `queue.add` ships `page:2` to the server (zod schema accepts it).
5. The room broadcasts the song record; every client renders it with the correct title.
6. **The player calls `embedUrl(song)` to build the iframe `src`. The Bilibili branch builds `bvid=…&autoplay=…&t=…&high_quality=…&danmaku=…&as_wide=…` — and never references `song.page`.**

So everything except step 6 already works. The fix is one line in `embedUrl`.

## Goals / Non-Goals

**Goals:**
- For multipart Bilibili songs, the iframe plays the requested P, not P1.
- Defaults stay benign: a song with no `page` (or `page:1`) keeps playing P1.

**Non-Goals:**
- We're NOT adding a UI for the user to pick a different P at queue time. The parser honors what they pasted; nothing more.
- We're NOT exposing `page` as an editable field in any sheet.
- We're NOT changing the backend or the song schema (both already handle `page`).

## Decisions

**Append `page=${song.page || 1}` directly in the existing `params` array** in `embedUrl`'s Bilibili branch.

- Why: smallest possible diff. The function already builds the param string by joining a literal array — adding one entry preserves the style.
- Alternative considered: only append the param when `song.page > 1`, to avoid changing iframe URLs for the (very common) P1 case. Rejected — the iframe behavior is documented as identical for `page=1` vs missing `page`, and emitting it unconditionally makes the URL self-describing and easier to debug.

**Keep existing `BV` / `av` ID handling unchanged.**

- The bug is orthogonal to ID-shape handling.

## Risks / Trade-offs

- [Risk] Bilibili changes the player iframe API and `page=N` stops working → Mitigation: low likelihood; the param has been stable for years. If it breaks we'd notice the same day from any multipart song.
- [Trade-off] Bilibili page indexes are 1-based; if a malformed song record carries `page:0` we'd send `page=1` (because of `|| 1`). Acceptable — better than `page=0` which the iframe would treat as invalid.
