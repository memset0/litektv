## ADDED Requirements

### Requirement: Floating QR fab is hidden on mobile

The floating QR fab in the lower-left corner SHALL be hidden on viewports `≤ 920px`. On a phone-shaped device the user already arrived via someone else's QR / share link, so a "scan to share" affordance is dead weight occupying a thumb zone. The cross-device share use case is still served by the topbar room-badge popup, which remains visible.

#### Scenario: Phone viewport

- **WHEN** the viewport is 375px wide
- **THEN** the `.fab-qr` button SHALL NOT be visible AND SHALL NOT receive pointer events

#### Scenario: Desktop viewport

- **WHEN** the viewport is 1280px wide
- **THEN** the `.fab-qr` button SHALL render in its normal lower-left position with the existing scan-to-join popup behaviour

### Requirement: Sidebar toggle is hidden on mobile

The topbar's sidebar toggle SHALL be hidden on viewports `≤ 920px`. The toggle's job is swapping between two side-by-side columns; on mobile the existing responsive auto-layout already collapses the stage to a single column, so the toggle has no effect. Hiding it removes a button that does nothing.

#### Scenario: Phone viewport

- **WHEN** the viewport is 375px wide
- **THEN** the `.sidebar-toggle` button SHALL NOT be visible

#### Scenario: Desktop viewport

- **WHEN** the viewport is 1280px wide and the sidebar is open
- **THEN** the `.sidebar-toggle` button SHALL render to the right of the me-chip with its existing collapse / expand behavior

### Requirement: List empty states top-anchor on mobile

On viewports `≤ 920px`, the queue / history list (`.list-scroll`) SHALL NOT flex-grow to fill remaining height in the side column. The empty-state placeholder SHALL therefore sit immediately below the tabs (top-anchored to its container), NOT vertically centered in the side panel. On desktop (`> 920px`) the existing `flex: 1` behavior is unchanged so a tall list still scrolls within a fixed-height side column.

#### Scenario: Empty queue on mobile

- **WHEN** the viewport is 375px wide, the queue tab is selected, and `room.queue.length === 0` with no current track
- **THEN** the `Paste a link to start the night ♪` placeholder SHALL render directly under the tabs, with no large vertical gap above it

#### Scenario: Empty queue on desktop

- **WHEN** the viewport is 1440px wide and the queue is empty
- **THEN** the `.list-scroll` container SHALL still flex-grow to fill the remaining side-column height (existing behavior); the empty placeholder SHALL render at the top of that container

## MODIFIED Requirements

### Requirement: Sidebar toggle (desktop)

The topbar SHALL include a button (immediately to the right of the me-chip) that hides/shows the side panel (queue + paste-link) on desktop viewports. The button SHALL NOT render on viewports `≤ 920px` (see "Sidebar toggle is hidden on mobile" requirement). Toggling on desktop SHALL animate via `grid-template-columns` plus an opacity+translate fade on the side column over ~280–320ms.

#### Scenario: Click hides the queue panel

- **WHEN** the user clicks the sidebar toggle while the panel is visible on a desktop viewport
- **THEN** the side column SHALL fade and slide right while `grid-template-columns` transitions from `1.5fr 0.9fr` to `1fr 0fr`, leaving the player at full width
