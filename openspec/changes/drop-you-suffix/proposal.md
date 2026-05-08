## Why

The ONLINE user strip currently appends `" (you)"` to the current user's name chip. The chip is already styled differently for the current user — `.user-chip.is-me` paints with a pink background, pink border, and pink text. The text suffix duplicates information the visual treatment already conveys, and on narrow screens it adds noise that pushes the strip to wrap. Same spirit as the existing "trim labels in topbar chips" rule: where styling already disambiguates, drop the redundant text.

## What Changes

- In `packages/frontend/app.jsx` `UsersStrip`, render `{u.name}` only — drop the `id === meId ? " (you)" : ""` suffix.
- The `is-me` styling stays — it's the only signal needed.
- No CSS edits; no other JSX changes.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `app-shell`: extend the existing label-trimming pattern to cover the ONLINE users strip — when a chip is already styled differently to mark "self", it SHALL NOT additionally append a "(you)" / "me" / similar text marker.

## Impact

- Affected code: `packages/frontend/app.jsx` (one expression).
- No backend changes, no schema changes, no new dependencies.
- Backward compatible — the user is still rendered, just without the redundant suffix.
