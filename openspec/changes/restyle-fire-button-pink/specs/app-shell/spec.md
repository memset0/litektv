## ADDED Requirements

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
