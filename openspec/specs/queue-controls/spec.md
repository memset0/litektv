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

The queue SHALL NOT expose a "Clear all" button. Only the shuffle action remains in the tab tools area.

#### Scenario: Inspecting the queue tab tools

- **WHEN** the user is on the queue tab with one or more pending rows
- **THEN** the tab-tools area SHALL contain only the shuffle icon (no CLEAR button, no other destructive bulk action)

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
