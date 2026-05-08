## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: No bulk-clear control

The queue SHALL NOT expose a "Clear all" button. Only the shuffle action remains in the tab tools area. The catalog (📚) and add-link (`+`) buttons SHALL NOT be considered bulk-destructive controls and SHALL be present in the action area regardless of queue length.

#### Scenario: Inspecting the queue tab tools

- **WHEN** the user is on the queue tab with one or more pending rows
- **THEN** the tab-tools area SHALL contain only the shuffle icon (no CLEAR button, no other destructive bulk action), and the action area SHALL contain only the `+` and 📚 buttons (no "Queue" label button)
