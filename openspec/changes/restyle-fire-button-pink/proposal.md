## Why

The "FIRE" send-danmaku button in the player column currently uses a cyan→purple gradient with a cyan glow, while the primary "QUEUE +" action button in the side column uses a pink→purple gradient. The two sit only a few pixels apart on screen and the color clash reads as inconsistent and visually noisy — the user has called the cyan style out as "ugly" against the rest of the layout. Aligning the FIRE button with the Queue button's pink-accent style restores visual consistency for primary actions.

## What Changes

- Restyle `.dm-send` (the FIRE button in `DanmakuComposer`) so its background, border, and box-shadow use the pink-accent palette (matching `.nbtn-pink`):
  - background: `linear-gradient(135deg, var(--neon-pink), var(--neon-purple))`
  - resting shadow: `0 0 0 1px rgba(255,46,166,0.4), 0 0 18px rgba(255,46,166,0.3)`
  - hover shadow: stronger pink glow (matching the Queue button hover)
- All other dimensions (size, font-weight, padding, border-radius) stay unchanged.
- No JSX changes — pure CSS.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `app-shell`: add a requirement that primary in-room action buttons share the pink-accent color scheme, so the FIRE and QUEUE buttons feel like one design system.

## Impact

- Affected code: `packages/frontend/ktv.css` (one rule block: `.dm-send` and its `:hover`).
- No backend changes, no schema changes, no new dependencies.
- Backward-compatible at runtime; the only observable change is a color shift on the FIRE button.
