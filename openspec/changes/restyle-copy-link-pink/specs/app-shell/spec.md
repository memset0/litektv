## ADDED Requirements

### Requirement: Clipboard-copy helper buttons share the pink-accent palette

Buttons whose only job is to copy a share-link to the clipboard SHALL use the same pink-accent visual language defined for primary in-room action buttons (the `nbtn-pink` style: pink→purple gradient with the pink box-shadow stack). This currently applies to the **COPY** button inside the RoomBadge sheet and the **COPY LINK** button inside the FloatingQR overlay — both sit next to the room QR.

Cyan is reserved for navigational / informational accents (room badge tag, QR ring, icon-only buttons like shuffle), not for clickable share/copy actions.

#### Scenario: COPY buttons in QR popups render in pink

- **WHEN** the user opens either the RoomBadge sheet (via the topbar room chip) or the FloatingQR overlay (via the bottom-left floating button)
- **THEN** the COPY / COPY LINK button inside SHALL paint with the pink→purple gradient and the pink box-shadow stack (i.e. `accent="pink"`)
- **AND** SHALL NOT render with a cyan resting glow
