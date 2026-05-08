## Why

We just unified the two primary in-room action buttons (QUEUE +, FIRE) onto the pink-accent palette in `restyle-fire-button-pink`. The two **COPY** / **COPY LINK** buttons that live inside the QR popups (RoomBadge modal and FloatingQR overlay) were missed in that pass — they still use `accent="cyan"`, which renders the old cyan→purple gradient with cyan box-shadow. The result is the same visual mismatch the user already objected to, just on a different surface.

Both buttons are clipboard-copy helpers next to the QR — purely "share-and-go" actions. They should match the rest of the action-button family (pink) for consistency.

## What Changes

- In `packages/frontend/app.jsx`, switch the two `<__UI.NeonButton accent="cyan" size="sm" onClick={() => navigator.clipboard.writeText(url)}>` instances (RoomBadge sheet at line ~131, FloatingQR popup at line ~194) to `accent="pink"`.
- No CSS edits — `nbtn-cyan` stays defined for any future legitimately-cyan callers; we just stop using it for the copy-link buttons.
- No backend changes.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `app-shell`: extend the existing pink-accent rule so that share/copy helper buttons (currently the two clipboard-copy buttons inside the RoomBadge sheet and the FloatingQR overlay) also use the pink palette.

## Impact

- Affected code: `packages/frontend/app.jsx` — two attribute changes (`accent="cyan"` → `accent="pink"`).
- No backend changes, no schema changes, no new dependencies.
- Backward compatible — the buttons still call `navigator.clipboard.writeText(url)`; only the gradient/glow color changes.
