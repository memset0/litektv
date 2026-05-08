## Context

The two primary actions in the room view sit close together but currently use clashing palettes:

- `.nbtn-pink` (the "QUEUE +" submit in `AddSongInput`) uses `linear-gradient(135deg, var(--neon-pink), var(--neon-purple))` plus a pink shadow stack.
- `.dm-send` (the "FIRE" send-danmaku in `DanmakuComposer`) uses `linear-gradient(135deg, var(--neon-cyan), var(--neon-purple))` plus a cyan shadow stack.

Both buttons exist for the same reason — they're the **commit** action of a single-line input — but they read as different families. The user has asked for visual consistency.

## Goals / Non-Goals

**Goals:**
- The FIRE button visually matches the QUEUE button at rest and on hover.
- Pure CSS change; no JSX edits, no design tokens added.

**Non-Goals:**
- We are NOT introducing a shared button component / mixin. `.dm-send` keeps its own selector because it has its own size and padding inside `.dm-input`.
- We are NOT redefining cyan as forbidden across the app — cyan still appears on icon buttons (e.g. shuffle, top), the room badge, and the QR popup. The shared palette rule applies to **primary** in-room action buttons only.

## Decisions

**Update `.dm-send` color tokens to the pink palette in place** rather than refactoring it to apply `.nbtn-pink`.

- Why: `.nbtn-pink` is `padding: 9px 16px` and lives outside the `.dm-input` flex row. Reusing the class would force a layout adjustment on the danmaku composer for no real benefit. A targeted color swap on the existing rule keeps the diff to one block.
- Alternative considered: change the JSX to render `<NeonButton accent="pink" size="sm">` instead of the bespoke `<button class="dm-send">`. Rejected — same churn, plus the FIRE button has a custom inline icon+label layout (`{Glyph.send}<span>FIRE</span>`) the NeonButton wrapper doesn't expose.

## Risks / Trade-offs

- [Risk] Two pink primaries close together could compete for attention (one is the only commit action in the input row, the other is across the layout) → Mitigation: they're rarely in the same eye-line; user explicitly asked for matching, so prioritize their preference.
- [Trade-off] Cyan is removed from the danmaku surface. Acceptable — danmaku still has cyan elsewhere (room badge, scan-to-join), the input itself doesn't need a unique accent.
