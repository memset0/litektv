## Context

We have a `NeonButton` component in `packages/frontend/app-ui.jsx` that takes an `accent` prop with two values — `"pink"` and `"cyan"` — mapped to `.nbtn-pink` and `.nbtn-cyan` CSS classes. The two CSS classes are mirror images:

- `.nbtn-pink` — `linear-gradient(135deg, var(--neon-pink), var(--neon-purple))` + pink box-shadow
- `.nbtn-cyan` — `linear-gradient(135deg, var(--neon-cyan), var(--neon-purple))` + cyan box-shadow

The QR popups use `accent="cyan"` for their COPY-link button. After the FIRE-button restyle the asymmetry is now visible: every other call-to-action button is pink, except for these two cyan ones tucked inside the QR popups.

## Goals / Non-Goals

**Goals:**
- The two COPY / COPY LINK buttons paint pink, matching every other clickable share/copy action.
- Smallest possible diff — JSX attribute swap, no CSS or component changes.

**Non-Goals:**
- We are NOT removing `nbtn-cyan` / `accent="cyan"` from the codebase. Cyan still has a place for future non-action affordances. Keeping the class defined means future devs can still opt in deliberately.
- We are NOT redefining `.nbtn-cyan` to be pink — that would silently change any other caller down the road.

## Decisions

**Edit the JSX (`accent="cyan"` → `accent="pink"`) at the two call sites** rather than mutating the CSS or removing the cyan accent entirely.

- Why: surgical and reversible. If a future use case for cyan emerges (e.g. a "Save preset" button that should feel different from "Send" / "Submit"), the class is still there.
- Alternative considered: introduce a new `accent="copy"` semantic variant that maps to pink today, leaving room for future tuning. Rejected — premature abstraction; the pink accent already conveys "primary action" and is the right home for COPY now.

## Risks / Trade-offs

- [Risk] We forget to revisit if cyan ever becomes the right color for one of these buttons → Mitigation: the spec requirement explicitly names "cyan is reserved for non-action affordances", which makes future regressions a spec violation rather than an unsignalled drift.
