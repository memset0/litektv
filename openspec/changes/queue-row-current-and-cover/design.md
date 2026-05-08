## Context

The current behavior:
- The queue side panel renders only `room.queue` (pending songs). The currently-playing track lives ONLY in the player area.
- `QueueRow` always passes `cover={null}`, per the original `song-card` spec carve-out.
- A "move to top" click on row 0 of pending sends `{type: "queue.top", id}` to the server, which is a no-op shape but still an unintentional state mutation that other clients see.

## Goals / Non-Goals

**Goals:**
- Queue list reads as a single ordered story: "now playing → next up → … → last queued."
- One source of truth for cover treatment (the `<CoverThumb>` primitive) — no surface-specific carve-outs.
- The pinned current row uses identical row chrome (height, padding, action bar layout) so visual scan along the list isn't disrupted.
- Disabled buttons (top + trash on current, top on next-up) reduce error mode where a casual click sends meaningless mutations to the room.

**Non-Goals:**
- No DnD on the pinned current row (keeping the existing "currently-playing track is not draggable" rule from `Drag-to-reorder rows`).
- No new WS message shape — `room.current` already arrives in every `state` snapshot.
- No new player-area changes — the player stays where it is; this is purely about the side panel.

## Decisions

### D1. The pinned row is just `QueueRow` with `isCurrent={true}` (and a different cover slot)

`QueueRow` already takes an `isCurrent` prop today; it currently only flips the `active` flag (border / glow / NOW PLAYING tag in meta) and hides `top` + `trash` entirely (they're rendered conditionally on `!isCurrent`). The new behavior:

1. `QueueRow` now passes a now-playing plate (instead of `null`) into the cover slot when `isCurrent` is true.
2. `top` and `trash` are STILL rendered on the current row but with `disabled={true}` — so the action area's column count matches a pending row exactly and the column doesn't shift visually when the song advances.
3. A new `disableTop` prop (separate from `isCurrent`) lets the parent disable just the `top` action — used for the row-1 cascade.

**Alternatives considered:**
- *Hide top/trash entirely on the current row (status quo)* — rejected because it makes the action-area width different on different rows, causing layout twitch when the song advances.
- *Render the current row through a separate `CurrentRow` component* — rejected because it duplicates SongCard plumbing for one slot's worth of difference.

### D2. The now-playing plate is a sibling of `<CoverThumb>`, not a variant of it

A new `<NowPlayingPlate>` in `app-ui.tsx` returns a 48×48 `<div>` with the existing `.song-card-cover-img` dimensions but a darker scrim background and a centered `Glyph.mic` (a new pink-tinted SVG). Implemented as its own component because:
- `<CoverThumb>` is for "fetch an image from `(source, videoId)`"; the plate has no source.
- Mixing the two responsibilities into one component (e.g. `<CoverThumb mode="now-playing">`) would make the prop surface harder to read at call sites.

CSS lives in `ktv-extras.css` next to the existing `.song-card-cover-*` selectors:
```css
.song-card-cover-now-playing {
  width: 48px; height: 48px;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.78)),
    var(--card-hi);
  display: grid; place-items: center;
  color: var(--neon-pink);
  /* mic glyph inherits color */
}
```

A new `Glyph.mic` SVG joins the existing `Glyph` collection in `app-ui.tsx`.

### D3. The "row-1 top is disabled" rule is computed at the parent, not inside `QueueRow`

`app.tsx` already iterates the queue with `room.queue.map((s, i) => ...)`. The cascade rule is "disable top on the row that's immediately after the pinned current row, OR on the row at index 0 of the pending portion if there is no pinned current". This is computable at the parent without `QueueRow` needing to know about the pinned row's existence. The parent just passes `disableTop={i === 0}` for the first pending row when current is present (and same when current is absent). Cleaner than threading "is there a pinned row above me" awareness into `QueueRow`.

### D4. No backend change

The server already broadcasts `room.current` in every `state` snapshot. The frontend just needs to render it.

If the user clicks the disabled top icon, `QueueRow`'s onClick is short-circuited before any send; no `queue.top` reaches the server. This is a pure-UI change.

## Risks / Trade-offs

- **[Risk] Row metric change** → A row that gains a cover gets ~48px taller / ~58px wider on the left. Existing CSS already handles `has-cover` via grid columns, so this is just toggling the existing class. Verify by visual inspection: queue rows with covers should match history rows pixel-for-pixel.
- **[Risk] Hot-link blocked covers in queue** → `<CoverThumb>` already has the placeholder fallback for blocked Bilibili hot-links. Verified for History; same code path applies to Queue.
- **[Risk] Drag-and-drop confusion** → The pinned current row should NOT be draggable. The existing `Drag-to-reorder rows` requirement says "currently-playing track is not draggable" — preserved by NOT wrapping the pinned row in the `q-drag-wrap` element.
- **[Trade-off] Disabled buttons take action-area space** → Slight visual cost of an extra greyed-out icon, in exchange for stable row chrome. Worth it.

## Migration Plan

This is a frontend-only change. Steps:

1. Implement (single-commit landing): add `Glyph.mic`, `<NowPlayingPlate>`, plate CSS, `QueueRow` `disableTop` prop + cover-slot toggle, `app.tsx` queue render path.
2. `pnpm build && hard-reload`. The systemd unit serves the new bundle from disk on next request — no restart needed for frontend-only changes.
3. Live verify: SPA at https://ktv.dev.mem.ac/, queue tab. Check (a) current row pinned with plate, (b) row-1 top disabled, (c) drag still works on rows 1+, (d) no current → row-0 top disabled instead.
4. Spec deltas merge automatically on `openspec archive`.

## Open Questions

None.
