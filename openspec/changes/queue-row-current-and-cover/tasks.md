## 1. Cover thumbnails on pending queue rows

- [x] 1.1 `QueueRow` in `app-ui.tsx` now renders `<CoverThumb source={song.source} videoId={song.videoId} />` for pending rows; the current row still passes `null` (Feature 2 will replace that with the plate).
- [x] 1.2 Build clean. Live verification deferred to user.
- [x] 1.3 Commit: `feat(ui): queue rows render cover thumbnails (parity with history/catalog)`

## 2. Pinned current track at the top of the queue

- [x] 2.1 `Glyph.mic` added — a 22×22 microphone SVG with the cap, stand, and arc, fill follows currentColor so the parent's pink color tint applies.
- [x] 2.2 `<NowPlayingPlate>` component added in `app-ui.tsx` (named export). Renders the plate `<div>` with the mic glyph inside.
- [x] 2.3 `.song-card-cover-now-playing` CSS added in `ktv.css` next to the existing `.song-card-cover-*` rules: dark scrim over `--card-hi`, pink mic center, with a soft drop-shadow on the SVG to make the mic glow.
- [x] 2.4 `QueueRow` cover slot now picks `<NowPlayingPlate />` when `isCurrent`, else `<CoverThumb>` (replaces the previous null fallback).
- [x] 2.5 `app.tsx` queue render path: when `room.current` is non-null, emit a `<QueueRow>` for it FIRST (NOT wrapped in `q-drag-wrap`, so non-draggable per the existing `Drag-to-reorder rows` requirement); then iterate `room.queue` as before. Also fixed empty-state copy: shows `Queue empty — drop more links ♪` only when there IS a current track but no pending; shows `Paste a link to start the night ♪` only when both are empty.
- [x] 2.6 Build clean. Live verification deferred to user.
- [x] 2.7 Commit: `feat(ui): pin currently-playing track as queue row 0 with now-playing plate`

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
