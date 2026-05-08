## 1. Mobile chrome polish (single CSS block)

The three fixes live in adjacent lines of the existing `@media (max-width: 920px)` block in `packages/frontend/src/styles/ktv.css` and share rationale, so they ship as one commit. The diff is six CSS lines.

- [x] 1.1 `.fab-qr { display: none; }` — hide the floating QR fab on mobile.
- [x] 1.2 `.sidebar-toggle { display: none; }` — hide the sidebar toggle on mobile.
- [x] 1.3 `.list-scroll { flex: 0 0 auto; }` plus `.empty { padding: 24px 12px; margin-top: 4px; }` — list empty state top-anchors on mobile instead of expanding into the middle of the screen.
- [x] 1.4 Frontend build clean. Live verification deferred to user.
- [x] 1.5 Commit: `fix(ui): tighten mobile chrome — hide QR fab + sidebar toggle, top-anchor empty list state`

## 2. Archive (handled by user)

- [ ] 2.1 User runs `openspec archive mobile-polish` once they've live-tested on a phone viewport (or DevTools at 375×812).
