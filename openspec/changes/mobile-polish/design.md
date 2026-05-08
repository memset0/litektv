## Context

The app collapses to a single-column layout below 920px, but two top-level chrome elements (the floating QR fab and the sidebar toggle) carry over into mobile where neither serves a purpose. Plus, the side-panel list-scroll's `flex: 1` assumption — true on desktop where the side column has a fixed `max-height: calc(100vh - 36px)` — backfires on mobile where the side column is content-height: the empty placeholder ends up vertically expanded into available space below the player, looking adrift.

## Goals / Non-Goals

**Goals:**
- Three small CSS-only fixes wrapped into one mobile-polish change.
- No JSX changes (don't conditionally render — let CSS hide).

**Non-Goals:**
- Don't redesign the mobile layout. Just close the three rough edges.
- Don't change the desktop behavior of any of these elements.

## Decisions

### D1. CSS-only via `display: none` (not React conditional rendering)

The cleanest hide is `display: none` in a media query — JSX stays the same, and the same single source of truth (`@media (max-width: 920px)`) applies. Using `useMediaQuery` or similar at the React layer would require a hook, a re-render on resize, and would couple the React tree to the CSS breakpoint. Pure CSS is more durable.

### D2. Drop `flex: 1` on `.list-scroll` mobile-only, not unconditionally

On desktop the list needs to flex-grow to fill the side column's `max-height: calc(100vh - 36px)` (so a long queue scrolls inside that fixed height). On mobile, the side column's `max-height` is removed and its height is content-driven; `flex: 1` then has the wrong effect (it stretches the empty container). The fix is to scope the override to mobile: `@media (max-width: 920px) { .list-scroll { flex: 0 0 auto; } }`.

### D3. Tighten `.empty` padding on mobile alongside the flex change

When the list is empty AND the container is content-height, the `.empty` placeholder's 40px vertical padding still looks oversized relative to the rest of the mobile chrome (which already squeezes paddings via the `≤480px` rule). Drop it to ~24px on mobile to keep visual rhythm.

## Risks / Trade-offs

- **[Risk] Hiding the sidebar-toggle on mobile means a stuck `is-sidebar-collapsed` shell class** — if the user collapsed the sidebar on desktop, then resized to mobile, the `shell.is-sidebar-collapsed` class persists. On mobile the layout is already single-column, so the visual outcome is unchanged regardless of the class. No risk; documented for posterity.
- **[Risk] The empty-state alignment fix relies on container height being driven by content** — true on mobile (`.side-col { max-height: none; }`). If a future change adds an explicit mobile `min-height` to `.side-col`, the fix would regress. Tasks list a one-line visual smoke for this.
- **[Trade-off] Hidden-not-removed fab still occupies layer space** — `display: none` removes it from layout entirely (not just visibility-hidden), so no thumb-zone hit-target lingers.

## Migration Plan

Single commit per the user's "one commit per feature" guidance — three small CSS additions, plus the spec deltas:

1. `feat(ui): hide QR fab on mobile`
2. `feat(ui): hide sidebar toggle on mobile`
3. `fix(ui): top-anchor list empty state on mobile`

OR a single combined commit since the three rules live in adjacent CSS lines and share rationale. I'll go with three separate commits to honor the user's commit-granularity preference.

## Open Questions

- Should the breakpoint be `≤ 920px` (matches the existing single-column breakpoint) or `≤ 480px` (true phone viewport)? Going with `≤ 920px` for both fab and toggle — at 700–900px (tablet portrait) the layout is already single-column, so the same rationale applies.
