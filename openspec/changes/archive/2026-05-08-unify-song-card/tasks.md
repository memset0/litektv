## 1. Primitive: SongCard + CoverThumb

- [x] 1.1 In `packages/frontend/app-ui.jsx`, add a `SongCard` component matching the slot model from `design.md` — props `{songKey?, cover, title, meta, actions, active, dragging, dropTarget}`. Render canonical-order meta bits (src, by, time, now); auto-insert a `·` between `by` and `time` when both present; no page bit.
- [x] 1.2 Add a `CoverThumb` component next to `SongCard`. Renders an `<img>` whose `src` is `/api/thumb?source=<s>&id=<id>` (works for both `yt` and `bili` via the existing redirect; once `thumbnail-cache` lands it'll be cached bytes). On `onError` swap to a generic placeholder `<div class="song-card-cover-placeholder">` — same dimensions, no number, no badge.
- [x] 1.3 Export both as `window.KTV.UI.SongCard` and `window.KTV.UI.CoverThumb`.

## 2. CSS: `.song-card*` namespace

- [x] 2.1 Add `.song-card*` rules to `ktv.css` using History's existing typography baseline: `padding: 10px 12px`, `border-radius: 10px`, title `font-weight:600 font-size:13px color:var(--ink-dim) line-height:1.35`, sub `font-size:11px color:var(--ink-mute) gap:6px`. Container: `display:flex; gap:10px; align-items:center; min-height: enough for 2-line title + 1-line meta`.
- [x] 2.2 Add the cover-column rules: when `.song-card` has a `.song-card-cover` child, switch to `display:grid; grid-template-columns: 48px 1fr auto;`. Cover is a 48×48 rounded tile.
- [x] 2.3 Add placeholder styling: `.song-card-cover-placeholder` is a 48×48 `border-radius:8px` `background:linear-gradient(...)` quiet card-toned tile, no inner content.
- [x] 2.4 Add state-modifier rules: `.song-card.is-active` (pink border + glow), `.song-card.is-dragging` (opacity 0.45 + dashed border), `.song-card.is-drop-target` (cyan border + glow). Mirror the existing q-row-active / drag-wrap visuals.

## 3. Action button unification

- [x] 3.1 Update `IconBtn` styling in `ktv.css`: drop the `.icon-btn.icon-pink:hover` and `.icon-btn.icon-cyan:hover` rules; the default neutral hover applies to all three buttons.
- [x] 3.2 Replace the `StarBtn` component in `app-ui.jsx`: render through `IconBtn` (same 30×30 chrome) with `Glyph.starOutline` when empty and `Glyph.starFilled` when filled. Filled uses `color: var(--ink)`. Remove the bespoke `.star-btn` rules from `ktv-extras.css`.
- [x] 3.3 In each call site (Queue, History), drop the `color="pink"` / `color="cyan"` props from the existing trash/top `IconBtn` usages.

## 4. Migrate CatalogModal

- [x] 4.1 Rewrite each `.cat-row` in `catalog.jsx` as a `<SongCard>` with `cover={null}`, `meta=[{src}, {by: f.addedBy}, {time: f.addedAt}]`, `actions={<button class="cat-add">+ 加入</button>}`. Keep the recently-added "is-flash" confirmation flow.
- [x] 4.2 Verify visually that the catalog modal's row chrome is now identical to History's (same padding, same title font, same sub line).

## 5. Migrate HistoryList

- [x] 5.1 Rewrite each `.hist-row` in `app.jsx`'s `HistoryList` as a `<SongCard>` with `cover={<CoverThumb source={s.source} videoId={s.videoId} />}`, `meta=[{src}, {by: s.addedBy}, {time: s.finishedAt || s.addedAt}]`, `actions=[<StarBtn />, <button class="hist-readd">+ REPLAY</button>]`.
- [x] 5.2 Drop the `.hist-num` index column entirely; do NOT pass any numbered prefix.
- [x] 5.3 Verify the placeholder fires for a Bili row that fails the hot-link, and that no broken-image artifact appears.

## 6. Migrate QueueRow

- [x] 6.1 Rewrite `QueueRow` in `app-ui.jsx` to render through `<SongCard>`. Map `isCurrent` → `active`. Pass `cover={null}`. Keep the existing prop signature so `app.jsx`'s drag-wrapper code is untouched.
- [x] 6.2 Wire the drag wrapper in `app.jsx` to pass `dragging={draggingId === s.id}` and `dropTarget={dragOverId === s.id && draggingId && draggingId !== s.id}` into `QueueRow`, which forwards them to `SongCard`. Remove the `.q-drag-wrap.is-dragging > .q-row` and `.q-drag-wrap.is-drop-target > .q-row` CSS — those are now handled via SongCard state classes.
- [x] 6.3 Confirm drag-to-reorder still works end-to-end (drag row 3 onto row 1, observe the reorder).

## 7. Remove the legacy CSS

- [x] 7.1 Delete `.q-row*`, `.hist-row*`, `.cat-row*`, `.hist-num`, `.q-actions`, `.cat-actions`, `.hist-actions`, and the bespoke `.star-btn*` rules. Verify no other selector still references them via `grep -n "q-row\|hist-row\|cat-row\|hist-num\|star-btn" packages/frontend/`.
- [x] 7.2 Search for any inline JSX `className` strings that still reference the old classes and remove them.

## 8B. Polish (post-initial-landing review)

- [x] 8B.1 Catalog rows render `<CoverThumb>` (originally null per the initial design; user reviewed and asked for covers there too — strongest visual cue for spotting a starred song).
- [x] 8B.2 `.song-card-body { flex: 1 }` so when the row is in flex mode (no cover) the actions slot anchors to the right edge instead of trailing the body content.
- [x] 8B.3 `.song-card-time` drops its `font-family: var(--font-mono)` + `font-size: 10.5px` overrides and inherits the sub-line baseline (matches the username's font, History style).
- [x] 8B.4 Catalog "+ 加入" pill and History "+ REPLAY" chip become icon-only `IconBtn`s (Glyph.plusSm and Glyph.replay respectively). The bespoke `.cat-add` and `.hist-readd` CSS rules are removed; `IconBtn` gains an optional `className` prop so the catalog can flash via `.icon-btn.is-flash` after a successful add.
- [x] 8B.5 Unified pink-gradient hover frame on `.icon-btn` and `.side-action` via `::after` + `mask-composite: exclude`. Frame-only — no inner colour change. Per-tint `icon-pink` / `icon-cyan` survive only on transport-bar buttons.
- [x] 8B.6 `.song-card { min-height: 72px }` so 2-line titles + 48px cover never overflow and rows are uniform height across surfaces.

## 9. Ship

- [x] 9.1 Per the project's auto-commit rule, commit each numbered group as it lands (`feat(ui): add SongCard + CoverThumb primitives`, `feat(ui): migrate catalog to SongCard`, `feat(ui): migrate history to SongCard with cover`, `feat(ui): migrate queue to SongCard`, `chore(ui): remove legacy q-row/hist-row/cat-row CSS`) and push immediately. Stage files explicitly by path — never `git add -A`.
- [x] 9.2 No backend code changed → no `systemctl restart` required. Hard browser reload is enough.
- [x] 9.3 Run `openspec archive unify-song-card` once the deployed feature is confirmed working (live-tested by user — confirmed OK 2026-05-08).
