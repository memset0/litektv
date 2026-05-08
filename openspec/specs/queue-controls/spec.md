# Queue Controls

## Purpose

How a user manipulates the room queue from the side panel. The queue is shared (every participant has equal rights); destructive bulk actions are intentionally absent and individual deletions require confirmation.
## Requirements
### Requirement: Drag-to-reorder rows

Each pending queue row SHALL be HTML5-draggable. Dropping one row onto another SHALL send `{type:"queue.reorder", id, toIndex}` to the backend, which splices the song into the target index. The currently-playing track is not draggable.

#### Scenario: User drags row 3 onto row 1

- **WHEN** the user drags the third pending row onto the first
- **THEN** the client SHALL send `{type:"queue.reorder", id:<row3.id>, toIndex:0}`
- **AND** the server SHALL move row 3 to index 0 and broadcast the new state

#### Scenario: Drop on the same row is a no-op

- **WHEN** the dragged row is released onto itself
- **THEN** no `queue.reorder` SHALL be sent

### Requirement: Top button stays as a one-click shortcut

Each row SHALL still expose a "move to top" icon (cyan up-arrow-with-cap glyph) for accessibility and one-click prioritization, since drag UX doesn't work on touch devices.

#### Scenario: User taps the top button on row 5

- **WHEN** the user clicks the top icon on the 5th pending row
- **THEN** the client SHALL send `{type:"queue.top", id}` and the server SHALL move that song to index 0

### Requirement: No up/down arrow buttons

Per-row up/down arrow buttons SHALL NOT be rendered — drag-and-drop replaces them.

#### Scenario: Inspecting a queue row's actions

- **WHEN** a non-current queue row is rendered
- **THEN** the actions area SHALL contain only the "move to top" icon and the trash icon (no up/down chevrons)

### Requirement: Confirm before delete (regardless of author)

Clicking the trash icon SHALL invoke `window.confirm(...)` with the song title before sending `{type:"queue.remove", id}`. This applies whether the song was queued by the current user or someone else.

#### Scenario: User cancels the confirm dialog

- **WHEN** the user clicks the trash icon and clicks "Cancel" in the confirm dialog
- **THEN** no `queue.remove` SHALL be sent

### Requirement: No bulk-clear control

The queue SHALL NOT expose a "Clear all" button. Only the shuffle action remains in the tab tools area. The catalog (📚) and add-link (`+`) buttons SHALL NOT be considered bulk-destructive controls and SHALL be present in the action area regardless of queue length.

#### Scenario: Inspecting the queue tab tools

- **WHEN** the user is on the queue tab with one or more pending rows
- **THEN** the tab-tools area SHALL contain only the shuffle icon (no CLEAR button, no other destructive bulk action), and the action area SHALL contain only the `+` and 📚 buttons (no "Queue" label button)

### Requirement: Uniform row dimensions

Each queue row SHALL render with a fixed minimum height that comfortably fits a 2-line clamped title plus a 1-line meta row. The title and meta SHALL be vertically centered inside the row regardless of how many lines the title actually takes.

#### Scenario: Short title and long title render at the same height

- **WHEN** one row's title fits on a single line and another wraps to two lines
- **THEN** both rows SHALL have the same height; the short-title row's content SHALL be vertically centered with empty space above and below

### Requirement: No thumbnails in queue/history rows

Queue and history rows SHALL display only the title + meta, NOT a video thumbnail. Backend may still include `thumb` in song records (used elsewhere); the queue UI ignores it.

#### Scenario: Bilibili row with no working hot-link

- **WHEN** a row's `song.thumb` is a `http://i*.hdslb.com` URL that the browser refuses to load
- **THEN** the queue UI SHALL show only the text content with no broken-image artifact

### Requirement: Side-panel action area exposes `+` and catalog buttons

The side-panel header action area SHALL render two adjacent icon buttons in place of the previous "Queue" button:

1. A `+` (plus) button that opens the existing add-link input.
2. A 📚 (catalog) button to its right that opens the favorites modal.

The buttons SHALL be visible regardless of whether the user is logged in.

#### Scenario: Default render

- **WHEN** the side panel is open on the queue tab
- **THEN** the action area SHALL contain a `+` button followed by a 📚 button, with no "Queue" text button

#### Scenario: Catalog button opens the modal

- **WHEN** the user clicks 📚
- **THEN** a modal dialog SHALL open centered over the app with a backdrop, containing a search input pinned at the top and a scrollable list of the global favorites ordered by `added_at` descending (newest first); pressing `Esc` or clicking the backdrop SHALL close it

### Requirement: Star button on every queue and history row (add-only)

Every queue row (current and pending) and every history row SHALL render a star button. The icon SHALL be filled when the row's `(source, videoId, page?)` is present in the global favorites snapshot, otherwise empty.

When the row is NOT yet favorited, clicking the star SHALL send `{type:"favorite.add", song:{...}}`. When the row IS already favorited, the button SHALL be `disabled` (no click handler, no WS message) and present a tooltip indicating the song is already saved (`已收藏`). v1 does NOT support unstar from this control.

#### Scenario: Star a pending row

- **WHEN** the user clicks an empty star on a pending queue row
- **THEN** the client SHALL send `favorite.add` populated from the row's `source`, `videoId`, `page`, `title`, and `thumb`, and after the resulting `favorites` snapshot the star SHALL render as filled and disabled

#### Scenario: Clicking a filled star is a no-op

- **WHEN** the user clicks a filled star on any queue or history row
- **THEN** no WebSocket message SHALL be sent and the favorites set SHALL remain unchanged

### Requirement: Catalog modal "+ to queue" action

Each favorite row in the catalog modal SHALL expose a single action button — "+ 加入" — that adds the song to the queue. Clicking it SHALL send `{type:"queue.add", ref:{source, videoId, page?}}` (using the `ref` shape, not a URL) and SHALL NOT close the modal, so users can add several songs in a row. The catalog modal SHALL NOT expose a per-row remove/unstar control in v1.

#### Scenario: Add three favorites in a row

- **WHEN** the user clicks "add to queue" on three different favorite rows in succession
- **THEN** the client SHALL send three `queue.add` messages with their respective `ref` payloads, the modal SHALL stay open, and after each response a transient confirmation SHALL appear on the row

