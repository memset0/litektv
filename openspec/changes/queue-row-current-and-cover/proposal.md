## Why

The queue side panel today shows only pending songs — the currently-playing track lives separately in the player area. That makes the side panel feel "empty" while a song plays (one fewer row visible) and forces the user to track the current track in two places. It also creates an awkward edge case for the "move to top" action: a top on row 0 noisily jumps a pending song *above* the current track, even though the server's track-transition contract says the next song to play is already the current one's successor.

Two related polish gaps land in the same surface, so it's natural to fix them together:

1. Queue rows are the only `SongCard` surface without covers — the original spec said "queue rows SHALL render no cover" with no strong rationale. With history and catalog already rendering covers and the user repeatedly asking for parity, queue should match.
2. There's no in-list signal for "this is the song I'm hearing right now" because the current track isn't even *in* the list.

## What Changes

- **MODIFIED** `song-card`: queue rows SHALL now render a cover thumbnail (or its placeholder) like history and catalog rows, via the shared `<CoverThumb>` primitive — eliminating the surface-specific exception.
- **ADDED** to `queue-controls`: the queue list SHALL render the currently-playing track (`room.current`) as a pinned row 0, distinct from the pending rows. The pinned row's cover slot SHALL be replaced with a "now playing" plate (dark scrim + pink mic glyph) so the user can spot it instantly.
- **ADDED** to `queue-controls`: the pinned current row SHALL have its `top` and `trash` actions disabled — neither operation is meaningful for the song the room is already playing.
- **ADDED** to `queue-controls`: the pending row immediately after the pinned current row (the "next up" row) SHALL also have its `top` action disabled — a top on it is a no-op (it's already at index 0 of the pending tail) and an unintentional click should not be visually identical to a meaningful one.

## Capabilities

### New Capabilities

(None — both touched capabilities already exist.)

### Modified Capabilities

- `song-card`: lift the "queue rows render no cover" carve-out; queue now uses the same cover-with-fallback contract as history and catalog.
- `queue-controls`: add the pinned-current-row behavior (its visual treatment, its disabled actions, and the cascade-disable of the next row's `top` action).

## Impact

**Code**
- `packages/frontend/src/app-ui.tsx` — `QueueRow` accepts an `isCurrent` mode that swaps `cover={null}` for a now-playing plate, and gates `top`/`trash` rendering. Add a `<NowPlayingPlate>` element (small, lives next to `CoverThumb` since it's the same slot).
- `packages/frontend/src/app.tsx` — when `room.current` is non-null, prepend it to the rendered queue list with `isCurrent={true}`, then render `room.queue` rows with the row-1 `top` disabled.
- `packages/frontend/src/styles/ktv-extras.css` — add `.song-card-cover-now-playing` (dark scrim + centered pink mic).

**Specs**
- `openspec/specs/song-card/spec.md` — drop the "queue cover slot is null" carve-outs; say queue uses the same cover contract as history/catalog. Update affected scenarios.
- `openspec/specs/queue-controls/spec.md` — add three requirements: pinned current row, disabled current actions, and disabled next-row top.

**Wire compatibility**
- No backend / WS protocol changes. The current track is already broadcast in `room.current` as part of every `state` snapshot.

**Out of scope**
- The `<NowPlayingPlate>` is only the cover-slot replacement; the existing inline NOW PLAYING tag in the meta line stays as-is so the row still has a textual signal even if the user only sees half the row.
- Drag-and-drop semantics for the pinned row — disabling drag on row 0 is a natural follow-up but lives outside this change.
