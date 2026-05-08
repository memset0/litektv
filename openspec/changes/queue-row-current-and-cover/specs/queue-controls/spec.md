## ADDED Requirements

### Requirement: Pinned current track at the top of the queue list

When `room.current` is non-null, the queue list SHALL render that song as a pinned row 0, ABOVE all pending rows. The pinned row SHALL render through the same `SongCard` primitive as the rest, with the **same default chrome** as a pending row — NO active-style border highlight, NO pink glow. The pinned row's `cover` slot SHALL be a now-playing plate (a 48×48 dark scrim with a centered pink karaoke-mic glyph) that replaces the normal `<CoverThumb>`. The pinned row's meta line SHALL be collapsed to ONLY the `▶ NOW PLAYING` tag — `src` / `by` / `time` bits SHALL be dropped, because the plate already identifies the row as the current track and the adder/time noise distracts from that. When `room.current` is null the queue list renders only pending rows (no pinned slot, no placeholder).

#### Scenario: Current song is playing

- **WHEN** the queue tab is visible and `room.current` is a Song
- **THEN** the first row in the list SHALL be that song, rendered with the now-playing plate in the cover slot, the meta line containing ONLY `▶ NOW PLAYING` (no source pill, no adder, no relative time), and standard non-active row border/chrome
- **AND** the rows below SHALL be `room.queue` in unchanged order

#### Scenario: No song is playing

- **WHEN** the queue tab is visible and `room.current` is null
- **THEN** the queue list SHALL render only `room.queue` rows; there SHALL NOT be a pinned current row, an empty pinned-slot placeholder, or any "no current track" stub row

### Requirement: Pinned current row's top and trash actions are disabled

The pinned current row SHALL render the same star button as any other row, but its `top` and `trash` action buttons SHALL be disabled (rendered with the existing `:disabled` chrome — reduced opacity, no hover affordance, no click handler firing). The buttons SHALL still occupy their slots so the row's action-area width matches a pending row; only their interactivity is suppressed.

The rationale: "move to top" is meaningless for a song already playing; deletion of the current track is intentionally NOT exposed as a one-click action to avoid yanking the song mid-playback (the next-track action provides the same outcome, with clearer intent).

#### Scenario: User clicks the disabled top button on the pinned current row

- **WHEN** the user clicks the (disabled) top icon on the pinned current row
- **THEN** no `queue.top` SHALL be sent
- **AND** no visual click feedback SHALL fire

#### Scenario: User clicks the disabled trash button on the pinned current row

- **WHEN** the user clicks the (disabled) trash icon on the pinned current row
- **THEN** no `window.confirm` SHALL appear, no `queue.remove` SHALL be sent

### Requirement: Top action is disabled on the row immediately after the pinned current row

When the queue list shows the pinned current row at index 0 AND at least one pending row at index 1, that index-1 row's `top` action button SHALL also be disabled. A `queue.top` on it would be a no-op (it is already at the top of the *pending* portion of the queue), and an unintentional click should not appear distinguishable from a meaningful one. Other action buttons on the index-1 row (star, trash) remain enabled — only `top` is suppressed.

When the queue list has no pinned current row (i.e. `room.current` is null), the row at index 0 of the pending list SHALL also have its `top` action disabled, by the same reasoning.

#### Scenario: With a current track playing

- **WHEN** the queue list renders one pinned current row plus three pending rows
- **THEN** the first pending row's top icon SHALL be disabled
- **AND** the second and third pending rows' top icons SHALL be enabled

#### Scenario: With no current track

- **WHEN** `room.current` is null and the queue list renders three pending rows
- **THEN** the first pending row's top icon SHALL be disabled
- **AND** the second and third pending rows' top icons SHALL be enabled

## MODIFIED Requirements

### Requirement: No up/down arrow buttons

Per-row up/down arrow buttons SHALL NOT be rendered — drag-and-drop replaces them.

#### Scenario: Inspecting a pending queue row's actions

- **WHEN** a pending (non-current) queue row is rendered
- **THEN** the actions area SHALL contain only the star (favorite) icon, the "move to top" icon, and the trash icon — all rendered via the unified `.icon-btn` chrome — with no up/down chevrons

#### Scenario: Inspecting the pinned current row's actions

- **WHEN** the pinned current row is rendered
- **THEN** the actions area SHALL contain the star icon (enabled) plus a disabled top icon and a disabled trash icon (same set, same chrome, no chevrons) — the slot positions match a pending row but the latter two are non-interactive

### Requirement: No thumbnails in queue/history rows

Queue rows, History rows, AND Catalog rows SHALL render the song's cover thumbnail in the `SongCard` cover slot, with a generic placeholder fallback when the cover URL fails to load. The pinned current queue row is the one exception: its cover slot is occupied by the now-playing plate (see "Pinned current track" requirement), not a `<CoverThumb>`. The `thumb` field on song records may be used as the source URL on any of the three surfaces; see the song-card capability for the full cover-with-fallback contract.

#### Scenario: Pending queue row with a thumb in the song record

- **WHEN** a pending queue row's underlying song has a non-null `thumb` URL
- **THEN** the row SHALL render a `<CoverThumb>` in the cover slot, identical in size and chrome to a History or Catalog cover

#### Scenario: Pinned current queue row

- **WHEN** the pinned current queue row is rendered
- **THEN** its cover slot SHALL contain the now-playing plate (NOT a `<CoverThumb>`) — even if the underlying song has a `thumb` URL — so the row clearly reads "this is the song the room is hearing right now"

#### Scenario: History/Catalog row whose Bilibili cover hot-link is blocked

- **WHEN** a History or Catalog row's cover URL is a Bilibili `http://i*.hdslb.com` URL that the browser refuses to load
- **THEN** the row SHALL render the generic placeholder tile in the cover slot, with no broken-image artifact, and no numerical index in its place
