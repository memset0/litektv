## Why

Three small mobile UX rough edges have accumulated as the desktop UI grew:

1. The floating QR fab (lower-left) is for "scan to share this room with someone in the room with you" — but a phone-shaped device IS the thing someone scans WITH; on mobile the user already arrived via someone else's QR or share link, so the fab is dead weight occupying a thumb zone.
2. The sidebar-toggle button (right of the me-chip) is meaningful only when the layout has two side-by-side columns to swap between. On mobile the `@media (max-width: 920px)` rule already collapses the layout to a single column, so the toggle has no effect on mobile — it's a button that does nothing visible.
3. With an empty queue / empty side-panel list, the content visually drifts toward the middle of the screen on mobile because the `.list-scroll` `flex: 1` rule makes the container expand to fill remaining space below the player, pushing the empty placeholder into the vertical center. The user expects the empty state to sit immediately under the tabs (top-anchored) so it reads as "this section starts here, with no items yet."

## What Changes

- **MODIFIED** `app-shell` "Sidebar toggle (desktop)": this requirement already implies "desktop" by name but nowhere makes the mobile-hidden behavior normative. Make it explicit — the toggle SHALL be hidden on viewports where the layout is single-column (`≤920px`).
- **ADDED** to `app-shell`: floating QR fab SHALL be hidden on the same `≤920px` breakpoint. (The header room-badge popup remains as the share affordance — it's still reachable and still serves the cross-device share use case.)
- **ADDED** to `app-shell`: list empty states SHALL be top-anchored (NOT vertically centered) on mobile. `.list-scroll` SHALL NOT flex-grow on viewports `≤920px`, so the `.empty` placeholder sits immediately below the tabs.

## Capabilities

### New Capabilities

(None.)

### Modified Capabilities

- `app-shell`: extend the responsive-auto-layout requirement set with explicit mobile-only behaviors for the QR fab, sidebar toggle, and empty-state alignment.

## Impact

**Code**
- `packages/frontend/src/styles/ktv.css` — add a small block of `@media (max-width: 920px)` rules: `.fab-qr { display: none; }`, `.sidebar-toggle { display: none; }`, `.list-scroll { flex: 0 0 auto; }`, and a tighter `.empty` padding on mobile so the placeholder reads compact.
- No JSX changes — all three are pure CSS.

**Specs**
- `openspec/specs/app-shell/spec.md` — extend the existing "Sidebar toggle (desktop)" requirement to be normative about the mobile-hidden case, and add three small requirements for the mobile-specific behaviors.

**Wire compatibility**
- None affected (frontend-only, CSS-only).

**Out of scope**
- The desktop sidebar-toggle behavior (animation timing, `grid-template-columns` interpolation, etc.) is unchanged.
- The QR popup chrome itself (border, slug color) is unchanged — that was handled by an earlier polish commit.
- Phone-specific layout improvements outside the three items above (e.g. landscape orientation tweaks) are not in scope.
