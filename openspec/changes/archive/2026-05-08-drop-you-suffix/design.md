## Context

`UsersStrip` (in `packages/frontend/app.jsx`) renders one chip per online user. The current user's chip carries:

1. Pink-accent styling via `className={\`user-chip ${id === meId ? "is-me" : ""}\`}` — the only chip with `.is-me`.
2. The text suffix `{id === meId ? " (you)" : ""}` after the name.

The user has asked to remove (2). Both the visual signal and the text signal say the same thing; the visual one is sufficient.

## Goals / Non-Goals

**Goals:**
- Drop the `" (you)"` suffix from the self chip.
- Keep all other UsersStrip behavior intact (sort order, online filter, emoji rendering, `is-me` styling).

**Non-Goals:**
- We are NOT removing the `.user-chip.is-me` styling.
- We are NOT changing the sort order (the current user still floats to the front of the list).
- We are NOT generalizing this into a config — it's a one-line cleanup.

## Decisions

**Inline edit at the JSX site** rather than introducing a helper.

- Why: one-line change, no abstraction is justified. The `{id === meId ? " (you)" : ""}` becomes simply absent.
- Alternative considered: change `(you)` to a localized / configurable label. Rejected — the proposal is to remove the label entirely, not to refine it.

## Risks / Trade-offs

- [Risk] Some users may have come to rely on the text label and miss it after removal → Mitigation: the pink-accent styling is high contrast against the `rgba(164,92,255,0.15)` background of regular chips, plus the current user's chip floats to the front via the existing sort. Self-identification stays trivially obvious.
