## 1. Cover thumbnails on pending queue rows

- [ ] 1.1 In `packages/frontend/src/app-ui.tsx`, change `QueueRow`'s `cover={null}` to render `<CoverThumb source={song.source} videoId={song.videoId} />` when `!isCurrent`. Pending rows now have covers.
- [ ] 1.2 Verify visually (live build): a pending queue row's cover column matches a history row's column pixel-for-pixel.
- [ ] 1.3 Commit: `feat(ui): queue rows render cover thumbnails (parity with history/catalog)`

## 2. Pinned current track at the top of the queue

- [ ] 2.1 Add `Glyph.mic` to the `Glyph` collection in `app-ui.tsx` — a microphone SVG sized 18×18 to fit centered inside a 48px plate.
- [ ] 2.2 Add `<NowPlayingPlate>` component in `app-ui.tsx` (sibling of `CoverThumb`) — returns a `<div className="song-card-cover-now-playing">` with the mic glyph inside. No props needed.
- [ ] 2.3 Add CSS for `.song-card-cover-now-playing` in `ktv-extras.css` per design D2: 48×48, dark scrim over `--card-hi`, pink mic centered.
- [ ] 2.4 Update `QueueRow` in `app-ui.tsx` so when `isCurrent={true}`, the cover slot renders `<NowPlayingPlate>` (not the new `<CoverThumb>` and not null).
- [ ] 2.5 In `app.tsx`'s queue render path, when `room.current` is non-null, emit a `<QueueRow>` for it FIRST (with `isCurrent={true}` and not wrapped in the `q-drag-wrap` element so it's non-draggable), then iterate `room.queue` as before.
- [ ] 2.6 Verify visually: pinned row has the plate, NOW PLAYING tag, glow border, no cover image.
- [ ] 2.7 Commit: `feat(ui): pin currently-playing track as queue row 0 with now-playing plate`

## 3. Disable destructive actions on current and next-up rows

- [ ] 3.1 Update `QueueRow` to render `top` and `trash` UNCONDITIONALLY (drop the `!isCurrent &&` guard) so the action area always has the same column count. Pass `disabled={isCurrent || idx === 0}` to top, `disabled={isCurrent}` to trash.
- [ ] 3.2 Add a `disableTop` prop to `QueueRow` so the parent can disable JUST the top action without setting `isCurrent`. Use it in `app.tsx` to disable the row-1 top when current is present (or row-0 top when current is absent).
- [ ] 3.3 In `app.tsx`'s queue render path: pending rows pass `disableTop={i === 0}` so the topmost pending row's top is disabled regardless of whether a pinned current row sits above it.
- [ ] 3.4 Verify: clicking the disabled top icon on the current row OR the row-1 row sends nothing over `/ws`; trash on current row doesn't open the confirm dialog.
- [ ] 3.5 Commit: `feat(ui): disable top/trash on current row, disable top on next-up row`

## 4. Build + push

- [ ] 4.1 `pnpm --filter litektv-frontend typecheck && pnpm --filter litektv-frontend build` — confirm clean.
- [ ] 4.2 Push all three feature commits (this happens incrementally per CLAUDE.md auto-push rule).
- [ ] 4.3 Live verify on https://ktv.dev.mem.ac/ — queue tab, with and without a current track, with and without queue rows.

## 5. Archive (handled by user)

- [ ] 5.1 User runs `openspec archive queue-row-current-and-cover` once they've live-tested.
