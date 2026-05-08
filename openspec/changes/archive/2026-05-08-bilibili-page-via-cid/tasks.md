## 1. Backend — types + parser

- [x] 1.1 `ParsedSongMeta` and `Song` in `packages/backend/src/types.ts` gained an optional `cid?: number` field (Bilibili-only — YouTube ignores it). Documented in JSDoc.
- [x] 1.2 `fetchBilibiliMeta` in `parser.ts` now extracts `cid` from `data.pages[].cid` (matching the requested page; falls back to `pages[0].cid` and then `data.cid` for single-part videos).
- [x] 1.3 `finalizeMeta` propagates `cid` into the returned `ParsedSongMeta` for Bilibili. YouTube branch returns `cid: undefined`.

## 2. Backend — WS schemas + queue/favorite paths

- [x] 2.1 `songSchema`, `songRefSchema`, and `favoriteAddSongSchema` (`.strict()`) all accept `cid: z.number().int().nonnegative().optional()`.
- [x] 2.2 `queue.add` `parsed.song` branch sets `cid: sng.cid`. The `parsed.ref` branch now re-parses on Bilibili refs whenever `cid` is missing (even when title is cached) so catalog re-adds for known favorites still pick up cid.
- [x] 2.3 `favorite.add` accepts `cid` in the schema; the favorites table doesn't have a `cid` column in v1, so the field is dropped at the DB write. Adding the column is a future change.

## 3. Frontend — embedUrl selector

- [x] 3.1 `embedUrl` in `urlparse.ts` now picks the page-selector parameter by branching on UA + cid availability (final design after live-testing — see below):
  - mobile UA → `p=N`
  - desktop UA + song has cid → `cid=N`
  - desktop UA + no cid → `page=N` (legacy verified-working fallback)
- [x] 3.2 Inline `EmbedSong` shape extended with `cid?: number`.

**Iteration during live-testing**:
1. First attempt: cid > p > default. Did NOT work on mobile because `player.bilibili.com/player.html` redirects mobile UAs to `mbplayer.html`, which ignores `cid=`.
2. Second attempt: emit BOTH `cid=` AND `p=`. Worked but emitted two redundant params.
3. Final: branch on `/AppleWebKit.*Mobile.*/` (the same regex Bilibili itself uses) and emit a single appropriate selector.

## 4. Frontend — Song flow preserves cid

- [x] 4.1 `AddSongInput.submit` plumbs `cid` from `parsed.cid` (computed via the same `"cid" in parsed ? parsed.cid : undefined` pattern as the other parsed-* locals) into the new `QueueSong.cid` field.
- [x] 4.2 `app.tsx`'s `addSong` (paste + history-replay) and the catalog modal's `onAddRef` path both preserve `cid` automatically via the `Song` type re-import + the existing `...s` spreads / backend `parseRef`.
- [x] 4.3 `pnpm --filter litektv-frontend typecheck && pnpm --filter litektv-frontend build` clean.

## 5. Build, restart, push

- [x] 5.1 `pnpm build` at repo root produced both `dist/` outputs (commit `df31092` + later iterations).
- [x] 5.2 `sudo systemctl restart litektv.service` — Active 2026-05-08 22:55:22 UTC, PID 3549680 onwards (multiple restarts during iterative live-testing).
- [x] 5.3 Commits landed incrementally: `df31092` backend, `3ef67bb` initial frontend, `0fdd87d` dual-emit fix, `741b529` UA-aware selector. Each pushed immediately.

## 6. Live verification

- [x] 6.1 `curl -X POST https://ktv.dev.mem.ac/api/parse-link -d '{"url":"…?p=4"}'` returns `cid: 1375775815` for `BV1TN4y187xe?p=4` (verified live).
- [x] 6.2 Multi-part Bilibili songs play the right page on **both** desktop AND mobile (verified by user 2026-05-08 after the UA-aware fix landed).
- [x] 6.3 Single-part Bilibili songs still play correctly (no regression).
- [x] 6.4 Pre-existing rows in the DB were retroactively backfilled with `cid` via `/tmp/backfill-cid.mjs` — 31/31 unique (videoId, page) pairs hit, 51 song records updated across 8 rooms. Now ALL stored Bilibili songs (including legacy queue/history) have both `page` and `cid`.

## 7. Archive (handled by user)

- [x] 7.1 User confirmed live-tested 2026-05-08; ready for `openspec archive bilibili-page-via-cid`.
