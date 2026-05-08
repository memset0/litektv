## 1. Switch the two COPY buttons to pink

- [x] 1.1 In `packages/frontend/app.jsx` `RoomBadge`, change the COPY button's `accent="cyan"` to `accent="pink"`
- [x] 1.2 In `packages/frontend/app.jsx` `FloatingQR`, change the COPY LINK button's `accent="cyan"` to `accent="pink"`

## 2. Verify

- [x] 2.1 Open the RoomBadge sheet (click the slug chip in the topbar) — the COPY button paints pink, matching FIRE / QUEUE
- [x] 2.2 Open the FloatingQR popup (bottom-left scan icon) — the COPY LINK button paints pink
- [x] 2.3 Confirm no other element regressed — non-action cyan affordances (room slug tag, QR ring, shuffle icon, sidebar toggle) still render in cyan