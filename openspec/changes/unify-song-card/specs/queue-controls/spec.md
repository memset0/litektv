## MODIFIED Requirements

### Requirement: Top button stays as a one-click shortcut

Each row SHALL still expose a "move to top" icon (up-arrow-with-cap glyph) for accessibility and one-click prioritization, since drag UX doesn't work on touch devices. The button SHALL render with the unified `.icon-btn` chrome (see the song-card capability) — the same square-bordered shape used by the delete button — without a per-button colour tint.

#### Scenario: User taps the top button on row 5

- **WHEN** the user clicks the top icon on the 5th pending row
- **THEN** the client SHALL send `{type:"queue.top", id}` and the server SHALL move that song to index 0

### Requirement: No up/down arrow buttons

Per-row up/down arrow buttons SHALL NOT be rendered — drag-and-drop replaces them.

#### Scenario: Inspecting a queue row's actions

- **WHEN** a non-current queue row is rendered
- **THEN** the actions area SHALL contain only the star (favorite) icon, the "move to top" icon, and the trash icon — all rendered via the unified `.icon-btn` chrome — with no up/down chevrons

### Requirement: Confirm before delete (regardless of author)

Clicking the trash icon SHALL invoke `window.confirm(...)` with the song title before sending `{type:"queue.remove", id}`. This applies whether the song was queued by the current user or someone else. The trash icon SHALL render with the unified `.icon-btn` chrome — the same chrome that the favorite and top buttons use after this change — so destructive intent is conveyed by the confirm dialog, not by the button's colour.

#### Scenario: User cancels the confirm dialog

- **WHEN** the user clicks the trash icon and clicks "Cancel" in the confirm dialog
- **THEN** no `queue.remove` SHALL be sent

### Requirement: No thumbnails in queue/history rows

Queue rows and Catalog rows SHALL NOT render a cover thumbnail. History rows SHALL render the song's cover thumbnail in the `SongCard` cover slot, with a generic placeholder fallback when the cover URL fails to load. The `thumb` field on song records may be used as the source URL on History rows; see the song-card capability for the full cover-with-fallback contract.

#### Scenario: Queue row with a thumb in the song record

- **WHEN** a queue row's underlying song has a non-null `thumb` URL
- **THEN** the queue row SHALL render only the title + meta + actions, with NO cover image (queue's `cover` slot is null by design)

#### Scenario: History row whose Bilibili cover hot-link is blocked

- **WHEN** a history row's cover URL is a Bilibili `http://i*.hdslb.com` URL that the browser refuses to load
- **THEN** the row SHALL render the generic placeholder tile in the cover slot, with no broken-image artifact, and no numerical index in its place
