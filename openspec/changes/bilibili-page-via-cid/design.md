## Context

The previously archived `bilibili-page-playback` change had `embedUrl` append `&page=${song.page || 1}` to the Bilibili player iframe URL. At the time it worked. Now it doesn't — `https://player.bilibili.com/player.html?bvid=BV1TN4y187xe&page=4&...` plays P1, regardless of what we pass. This is verified by direct SQLite inspection: the queue stores `page=4` for re-queued multipart links, and the title carries the right `- P4 …` suffix, so the regression is in **what the iframe URL says** versus what the iframe **does**.

The most reliable Bilibili player parameter for selecting a specific page is **`cid`** — the per-page content ID. Bilibili's `/x/web-interface/view` endpoint returns `pages: [{cid, page, part, duration}]`, and the player has historically honored `&cid=N` even when `&page=` / `&p=` were unreliable. We already call this endpoint to get titles and durations; we just throw the `cid` away.

## Goals / Non-Goals

**Goals:**
- Newly-added Bilibili songs (and re-parsed catalog adds) carry a per-page `cid` end-to-end.
- The frontend's `embedUrl` builds `?bvid=…&cid=…` URLs that reliably play the requested page.
- Legacy songs (in queues / history / favorites) that pre-date this change still get their best-effort attempt: drop the broken `&page=N` and use `&p=N` (which Bilibili's WATCH page itself uses), accepting that pure-P1 fallback is the worst case.

**Non-Goals:**
- No SQLite migration. Rooms persist as JSON blobs; favorites have a fixed columnar schema and we leave it alone.
- No background re-fetch to retroactively populate `cid` on old queue rows.
- No cross-cutting cleanup of `Song` type usage. Just wire the new optional field.

## Decisions

### D1. Backend extracts `cid` from the upstream `pages[]` array

`fetchBilibiliMeta(videoId, page)` currently returns `{title, thumb, duration}`. Extend to also extract `cid`:

```ts
const target = (d.pages || []).find((p) => p.page === page);
const cid = target?.cid ?? d.pages?.[0]?.cid ?? d.cid;  // best-effort fallback
return { title, thumb, duration, cid };
```

For single-part videos `d.pages` may be empty or have one entry; `d.cid` is the top-level cid that's also the only page's cid. Either way we set `cid`.

### D2. `cid` flows on `ParsedSongMeta` and `Song`, both optional

```ts
// types.ts
export interface ParsedSongMeta {
  source: Source;
  videoId: string;
  page?: number;
  cid?: number;       // ← new, Bilibili-only
  title: string;
  thumb?: string | null;
  duration?: number;
}

export interface Song {
  id: string;
  source: Source;
  videoId: string;
  page?: number;
  cid?: number;       // ← new
  title: string;
  thumb?: string | null;
  duration?: number;
  addedBy: AddedBy;
  addedAt: number;
  finishedAt?: number;
}
```

`ws.ts`'s zod schemas (`songSchema`, `songRefSchema`) gain `cid: z.number().int().nonnegative().optional()`. `queue.add` and `favorite.add` both forward it through.

### D3. `embedUrl` selector priority: cid > p > default 1

```ts
if (song.source === "bili") {
  const isBV = String(song.videoId).startsWith("BV");
  const idParam = isBV ? `bvid=${song.videoId}` : `aid=${song.videoId.replace(/^av/, "")}`;
  const pageSelector = song.cid
    ? `cid=${song.cid}`
    : `p=${song.page || 1}`;
  const params = [
    idParam,
    pageSelector,
    `autoplay=${autoplay ? 1 : 0}`,
    `t=${Math.floor(startSec || 0)}`,
    `high_quality=1`,
    `danmaku=0`,
    `as_wide=1`,
  ].join("&");
  return `https://player.bilibili.com/player.html?${params}`;
}
```

The legacy `page=N` parameter is removed entirely. The new `p=N` fallback is the parameter the user pasted in their URL bar — if Bilibili's player honors anything for "the user's page", it should be this. If it doesn't, the cid path is the reliable answer.

**Alternatives considered:**
- *Send all three (`p=`, `page=`, `cid=`) as belt-and-suspenders*. Rejected — increases URL noise and risks Bilibili's parser preferring the broken one. Single canonical selector is cleaner.
- *Wait until backend-fetch fails, then re-fetch in the frontend*. Rejected — adds a network round-trip on every play start; the backend already calls this endpoint.

### D4. Favorites table doesn't get a `cid` column (yet)

The favorites table's PK is `(source, video_id, page)`. Adding a `cid` column would be useful so re-add-from-catalog can ship a precise cid without re-fetching. But it's a separate change (the migration is non-trivial because of the PK constraint) and the catalog-add path goes through `parseRef` anyway, which after this change emits `cid` from the upstream API call.

## Risks / Trade-offs

- **[Risk] `&p=N` also stops working** → Old queue/history rows without `cid` will play P1. Mitigation: re-queue once and the new song carries `cid`. Documented in the proposal's "live data" section.
- **[Risk] Bilibili API call fails for some videos** → `cid` ends up undefined on the song record; `embedUrl` falls back to `&p=N`. Same risk profile as today.
- **[Risk] Old client + new backend** → Old client's `Song` type doesn't have `cid` so it's dropped in TS-land but JSON.stringify preserves it. The old `embedUrl` uses `&page=N` which still doesn't work. No regression vs. today.
- **[Risk] New client + old backend** → No backend in this configuration would emit `cid`; the new `embedUrl` falls back to `&p=N`. Same as the legacy-row case.
- **[Trade-off] We're guessing about what Bilibili's player accepts** → We have no way to test against Bilibili directly without a real browser. Mitigation: the user (memset0) live-tests on the deploy box during apply.

## Migration Plan

1. Backend: add `cid` to types + parser + ws schemas. Build, restart `litektv.service`.
2. Frontend: add `cid` to song shape (auto via type re-import), update `embedUrl`. Build (frontend dist/ updates).
3. Live test: memset0 pastes `https://www.bilibili.com/video/BVxxxx?p=N` for a known multipart video, verifies the iframe plays page N. Repeat with a single-part video to confirm no regression.
4. If `&p=N` doesn't work for legacy rows either, that's accepted; it's strictly no worse than today.

## Open Questions

- Should we ALSO drop `&p=` and only emit `&cid=` (forcing every non-cid row to re-queue)? Tentatively no — keeping `&p=` as a fallback is harmless if it works and graceful if it doesn't.
- Do we want a one-time migration that re-fetches cid for the existing favorites? Out of scope.
