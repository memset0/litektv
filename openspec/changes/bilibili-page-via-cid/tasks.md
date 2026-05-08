## 1. Backend — types + parser

- [ ] 1.1 In `packages/backend/src/types.ts`, add `cid?: number` to `ParsedSongMeta` and `Song` (Bilibili-only; YouTube ignores it).
- [ ] 1.2 In `packages/backend/src/parser.ts` `fetchBilibiliMeta`, also extract `cid` from the upstream `pages[]` array (or `data.cid` for single-part videos). Return `{title, thumb, duration, cid}`.
- [ ] 1.3 In `parser.ts` `finalizeMeta`, propagate `cid` into the returned `ParsedSongMeta` (Bilibili branch only).

## 2. Backend — WS schemas + queue/favorite paths

- [ ] 2.1 In `packages/backend/src/ws.ts`, add `cid: z.number().int().nonnegative().optional()` to `songSchema`, `songRefSchema`, and `favoriteAddSongSchema` (`.strict()` on the favorite one — the new key must be in the allowlist or the message gets rejected).
- [ ] 2.2 In the `queue.add` handler, the song-from-`song` branch already spreads via field-by-field assignment — add `cid: sng.cid` to the assignment. The `queue.add` ref branch (which calls `parseRef`) already gets `cid` via the parser, so just include `cid: meta.cid` (or the cached fav row's cid once that's wired) in the `song = { … }` literal.
- [ ] 2.3 In the `favorite.add` handler, similarly forward `cid` through to the `addFavorite` row construction. (The DB column doesn't exist yet — store it as a no-op for now; the column add is a future change. Document this in code.)

## 3. Frontend — embedUrl selector

- [ ] 3.1 In `packages/frontend/src/urlparse.ts`, change the Bilibili branch of `embedUrl` so the page selector is computed by priority: `cid` if present (build `cid=${song.cid}`), otherwise `p=${song.page || 1}`. Drop the existing `page=${song.page || 1}` line entirely.
- [ ] 3.2 Update the `EmbedSong` shape inline-typed in `embedUrl` to include `cid?: number`. Or simpler: import `Song` from `@litektv/types` and accept `Pick<Song, "source" | "videoId" | "page" | "cid">`.

## 4. Frontend — Song flow preserves cid

- [ ] 4.1 In `packages/frontend/src/app-ui.tsx` `AddSongInput`, plumb `cid` from `parsed.cid` into the QueueSong literal (alongside `page`, `title`, `thumb`, `duration`). Add a `parsedCid` local computed via the same `"cid" in parsed ? parsed.cid : undefined` pattern as `parsedPage`.
- [ ] 4.2 Verify that `app.tsx`'s `addSong` (for paste / replay-from-history) and the catalog modal's `onAddRef` path both preserve `cid` via existing `…s` spreads / through the backend's `parseRef` call. No code change needed there beyond the type pickup.
- [ ] 4.3 `pnpm --filter litektv-frontend typecheck && pnpm --filter litektv-frontend build` clean.

## 5. Build, restart, push

- [ ] 5.1 `pnpm build` at repo root (frontend + backend). Confirm both `dist/` outputs exist.
- [ ] 5.2 `sudo systemctl restart litektv.service`. Confirm `Active: …` timestamp is fresh and the unit serves the new bytecode.
- [ ] 5.3 Commit each completed feature group as it lands (one commit per `## N`-section per the project's "feature commit per change" convention) and push immediately.

## 6. Live verification

- [ ] 6.1 Paste a known multipart Bilibili URL with `?p=N` (e.g. `https://www.bilibili.com/video/BV1TN4y187xe?p=4`); confirm `/api/parse-link` returns a non-zero `cid` in the JSON response.
- [ ] 6.2 Confirm the song row shows the right `- P{N} {part}` title and the player iframe plays page N (not page 1).
- [ ] 6.3 Paste a single-part Bilibili URL; confirm playback still works (cid is set, page is 1).
- [ ] 6.4 Replay an OLD queue/history row (added pre-this-change, no `cid` stored). Expected: plays page 1 OR the right page if `&p=N` works for that resource. Either way: no worse than today.

## 7. Archive (handled by user)

- [ ] 7.1 User runs `openspec archive bilibili-page-via-cid` once they've live-tested.
