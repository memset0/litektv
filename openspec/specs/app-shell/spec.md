# App Shell

## Purpose

Frontend chrome around the player and queue: layout, topbar, tab title, scrollbar styling. The aesthetic is locked to "neon / cyber / Orbitron / comfy" — no user-facing knobs.
## Requirements
### Requirement: Responsive auto-layout

The layout SHALL adapt purely via CSS media queries; there SHALL be no manual SPLIT/TV/PHONE switcher. On viewports ≤920px the stage collapses to a single column with the side panel below the player. On ≤480px and ≤360px additional rules tighten paddings, font sizes, and icon-button sizes so nothing exceeds the viewport.

#### Scenario: Phone viewport

- **WHEN** the viewport is 375px wide
- **THEN** stage SHALL be one column; topbar children SHALL wrap; QR popup card SHALL fit `min(300px, 100% - 32px)`

### Requirement: Sidebar toggle (desktop)

The topbar SHALL include a button (immediately to the right of the me-chip) that hides/shows the side panel (queue + paste-link). Toggling SHALL animate via `grid-template-columns` plus an opacity+translate fade on the side column over ~280–320ms.

#### Scenario: Click hides the queue panel

- **WHEN** the user clicks the sidebar toggle while the panel is visible
- **THEN** the side column SHALL fade and slide right while `grid-template-columns` transitions from `1.5fr 0.9fr` to `1fr 0fr`, leaving the player at full width

### Requirement: Dynamic page title

`document.title` SHALL be set to `Room <slug> · Neon KTV` on app mount so each room has a distinct browser-tab label.

#### Scenario: Slug 473829

- **WHEN** the app mounts in room `473829`
- **THEN** `document.title` SHALL be `Room 473829 · Neon KTV`

### Requirement: Hidden scrollbars

Scrollbars SHALL be invisible across the page (both default and webkit), while scroll behavior remains functional. The white default scrollbar breaks the neon aesthetic; users still scroll with wheel/touch.

#### Scenario: Long queue scrolls without a visible track

- **WHEN** the queue list overflows its container
- **THEN** wheel and touch scrolling SHALL still work and no scrollbar track SHALL be drawn

### Requirement: Trim labels in topbar chips

The room badge SHALL display only the slug + ⌘ icon (no "ROOM" label). The me-chip SHALL display only the avatar + name (no "EDIT ›" hint). Hover/click affordance is conveyed by the chip styling, not text.

#### Scenario: Inspecting the topbar

- **WHEN** the topbar renders
- **THEN** the room badge SHALL contain only the slug text plus the ⌘ icon, AND the me-chip SHALL contain only the emoji and the name (no extra label spans)

### Requirement: White-background room QR

The room QR (both the inline RoomBadge sheet and the bottom-left FloatingQR popup) SHALL render with a white background (`bgcolor=ffffff`) and a dark foreground for maximum scannability. The decorative `.qr-frame` padding SHALL also be white, not pink.

#### Scenario: User opens "Scan to join"

- **WHEN** the user opens either QR popup
- **THEN** the QR image SHALL be black-on-white, regardless of the active theme palette

### Requirement: No localStorage room state

The browser SHALL NOT cache room state (queue, history, danmaku, etc.) in `localStorage`. The only `localStorage` usage permitted is the user's own identity (`ktv:me` — `userId`, `name`, `emoji`, `anonymous`) and a one-time cleanup that wipes legacy keys (`ktv:room:*`, `ktv:slug`, `ktv:layout`).

#### Scenario: Two browsers see the same room

- **WHEN** users A and B open the same `<slug>` in different browsers
- **THEN** both SHALL see identical queue + history + danmaku, sourced from the server, regardless of any browser-local state

### Requirement: Primary in-room action buttons share the pink-accent palette

Primary action buttons in the room view (currently the queue submit button "QUEUE +" in the side column and the danmaku send button "FIRE" in the player column) SHALL share the same pink→purple gradient and pink box-shadow tokens, so the room reads as one design system rather than competing accents. The shared visual language is the same one used by `.nbtn-pink`:

- background: `linear-gradient(135deg, var(--neon-pink), var(--neon-purple))`
- resting box-shadow: `0 0 0 1px rgba(255,46,166,0.4), 0 0 18px rgba(255,46,166,0.3)` (or visually equivalent)
- hover box-shadow: stronger pink glow (`0 0 0 1px rgba(255,46,166,0.6), 0 0 26px rgba(255,46,166,0.55)` or equivalent)

Other accent colors (cyan, etc.) remain reserved for non-primary affordances (icon-only buttons, info chips).

#### Scenario: FIRE and QUEUE buttons render with matching pink accents

- **WHEN** the room view is rendered with both the side column's "QUEUE +" button and the player column's "FIRE" button visible
- **THEN** both buttons SHALL paint with the pink→purple gradient background and the pink resting box-shadow listed above
- **AND** neither button SHALL render a cyan or non-pink resting glow

### Requirement: ONLINE users strip omits the "(you)" self-label

In the ONLINE users strip on the player column, the chip representing the current user SHALL render only the user's name (and emoji), with NO appended `" (you)"` / `" / me"` / similar text marker. The chip's distinct styling (`.user-chip.is-me` — pink background, pink border, pink text) is already enough to mark "self"; an extra text suffix duplicates the signal and clutters narrow viewports.

Same general principle as the existing "Trim labels in topbar chips" requirement: where dedicated styling already disambiguates, the chip SHALL NOT carry redundant text.

#### Scenario: Self chip in the ONLINE strip

- **WHEN** the current user is in the ONLINE users strip
- **THEN** their chip SHALL display only `<emoji> <name>` (e.g. `🎤 Stardust`), with the `is-me` pink styling, AND SHALL NOT include the substring `(you)`

