## 1. Hide floating QR fab on mobile

- [ ] 1.1 In `packages/frontend/src/styles/ktv.css`'s `@media (max-width: 920px)` block, add `.fab-qr { display: none; }`.
- [ ] 1.2 Build and live-verify on a phone viewport — QR fab gone; topbar room badge popup still works as the share affordance.
- [ ] 1.3 Commit: `feat(ui): hide floating QR fab on mobile (≤920px)`

## 2. Hide sidebar toggle on mobile

- [ ] 2.1 In the same `@media (max-width: 920px)` block, add `.sidebar-toggle { display: none; }`.
- [ ] 2.2 Build and live-verify — toggle gone on phone viewport; still present and functional on desktop.
- [ ] 2.3 Commit: `feat(ui): hide sidebar toggle on mobile (≤920px)`

## 3. Top-anchor list empty state on mobile

- [ ] 3.1 In the same `@media (max-width: 920px)` block, override `.list-scroll { flex: 0 0 auto; }` so the container no longer flex-grows to fill remaining height in the content-height side column.
- [ ] 3.2 Tighten `.empty { padding: 24px 12px; margin-top: 4px; }` in the mobile block so the placeholder reads compact.
- [ ] 3.3 Build and live-verify — empty queue placeholder on mobile sits directly under the tabs (not vertically centered).
- [ ] 3.4 Commit: `fix(ui): top-anchor list empty state on mobile`

## 4. Push + verify

- [ ] 4.1 `pnpm --filter litektv-frontend typecheck && pnpm --filter litektv-frontend build` clean.
- [ ] 4.2 Three commits pushed incrementally.
- [ ] 4.3 Live verify on https://ktv.dev.mem.ac/ from a phone viewport (or DevTools at 375×812).

## 5. Archive (handled by user)

- [ ] 5.1 User runs `openspec archive mobile-polish` once they've live-tested.
