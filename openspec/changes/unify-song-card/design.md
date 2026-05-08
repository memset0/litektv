## Context

The frontend is loaded as classic-script `<script type="text/babel">` modules sharing a single `window.KTV` namespace; each file IIFE-attaches its public surface (`window.KTV.UI = { ... }`). There is no bundler, no JSX import, no module graph. Today three call sites each hand-roll a song-row JSX tree:

| Call site            | File                          | Sub-line meta order                                          | Prefix              | Actions                                  | Hover/active state                  |
|----------------------|-------------------------------|---------------------------------------------------------------|---------------------|-------------------------------------------|-------------------------------------|
| Queue                | `app-ui.jsx` `QueueRow`       | `emoji name · time [▶ NOW PLAYING]`                           | none                | star · top · trash                        | hover-border, `q-row-active`        |
| History              | `app.jsx` `HistoryList`       | `emoji name · time [src-tag]`                                 | 2-digit index       | star · `+ REPLAY`                         | none                                |
| My Songs (catalog)   | `catalog.jsx` `CatalogModal`  | `[src-tag] [P# badge?] [emoji name ·] time`                   | none                | `+ 加入`                                  | hover-bg                            |

Each tree has its own CSS namespace (`.q-row*`, `.hist-row*`, `.cat-row*`) with subtly different paddings, gaps, title font sizes, and sub-line color. The user has flagged the visual inconsistency.

The data flowing into each row is essentially the same shape (`source`, `videoId`, `page?`, `title`, `thumb?`, `duration?`, `addedBy`, `addedAt`, optional `finishedAt`). The differences that need to survive consolidation are:

- **Queue** has an "is currently playing" state and is draggable.
- **History** wants a 2-digit index in front of the title.
- **Catalog** is the only surface where the `addedBy` is "first starrer" semantics rather than "queued by".
- The actions trio differs at every call site.

Everything else — the typography, the row container, the meta-separator dots, the hover affordance, the way the title is clamped — should be uniform.

## Goals / Non-Goals

**Goals:**

- One JSX primitive (`SongCard`) and one CSS namespace (`.song-card*`) that all three surfaces render through.
- **Typography baseline = History** (per the user's preference). The unified card adopts History's title (13px / `--ink-dim` / weight 600 / 1.35 line-height), sub (11px / `--ink-mute`), padding (`10px 12px`), and border-radius (10px). Queue's brighter / larger values are intentionally retired.
- Canonical meta-line order, identical across surfaces. Each surface declares which bits it wants; the *order* is fixed by the primitive. The `P#` / page badge is **dropped** — Bilibili multi-page titles already include `P{n} {part}` in the title text.
- **History's index column is replaced by a cover thumbnail.** A `<CoverThumb>` component renders the song's cover image and falls back to a generic placeholder tile on load failure or when no cover URL is known. The placeholder is image-shaped (not numbered) — the user explicitly noted that the row index isn't useful information and shouldn't survive in the placeholder.
- **Action buttons are unified into the existing `IconBtn` chrome** (30×30 bordered square, neutral hover). Star, top, and trash buttons all share that shape; the previous bespoke `StarBtn` is gone. The filled star uses `var(--ink)` (white) — not yellow.
- All visual states (default / hover / active-now-playing / dragging / drop-target) live on `SongCard`. Call sites set flags, never style.
- Adding a new field to song rows (e.g. duration badge, "favorited by" line) is a single edit to `SongCard`.
- No regressions: drag-to-reorder in the queue, the catalog's "+ 加入" flash-confirm, and the favorites add path all keep working.

**Non-Goals:**

- A redesign. The new look is the **least surprising harmonization** of the existing three; no new colors, no new icons, no new spacing scale.
- Module-system changes. Stays inside the `window.KTV.UI` namespace, no bundler.
- Storybook / isolated visual testing infra. Out of scope for this app.
- Behavior changes (no rules around "anyone can unstar", no new actions). The actions slot is opaque to `SongCard` — it just lays out children.

## Decisions

### Decision: One primitive `SongCard` exposed via `window.KTV.UI.SongCard`

Co-locate it with the other UI atoms in `app-ui.jsx` rather than carving a new file. The file is already the home of `NeonButton`, `IconBtn`, `StarBtn`, `Glyph`, etc. — `SongCard` is the same kind of thing. Splitting it out would require a new `<script type="text/babel">` tag in `KTV.html` and another IIFE; that's overhead for ~150 lines of component.

**Alternatives considered:**
- *New `song-card.jsx` file loaded between `app-ui.jsx` and `app.jsx`.* Rejected as unnecessary file fragmentation for the current size.

### Decision: Slot model — cover / title / meta bits / actions

`SongCard` props:

```js
SongCard({
  // identity (for keying / aria, optional)
  songKey,                 // e.g. `${source}:${videoId}:${page}`

  // left-side cover image slot. Pass <CoverThumb /> on History rows;
  // null/undefined on Queue and Catalog (no left column rendered).
  // Note: the slot is image-only — no numbered index, no badge.
  cover,                   // ReactNode | null

  // title (clamped to 2 lines via -webkit-line-clamp)
  title,                   // string

  // meta bits, rendered in canonical order (see below). Array of typed objects.
  meta,                    // Array<MetaBit>

  // right-side action area; whatever ReactNodes the caller wants
  actions,                 // ReactNode

  // visual states
  active,                  // boolean — "now playing" border + glow
  dragging,                // boolean — dimmed + dashed border
  dropTarget,              // boolean — highlighted drop indicator
})

// MetaBit kinds (NB: no `page` bit — title carries P# for Bili already):
//   { kind: "src",  source: "yt" | "bili" }   →  small src-tag pill
//   { kind: "by",   name, emoji }              →  emoji + name
//   { kind: "time", ts }                       →  "5m ago"-style time
//   { kind: "now" }                            →  "▶ NOW PLAYING" pill (renders only when active)
```

### Decision: Canonical meta-line order

Every meta line, regardless of surface, renders bits in this order (skipping any not provided):

1. `src` (small source-tag pill)
2. `by` (emoji + name)
3. `·` separator (auto-inserted between `by` and `time` if both present)
4. `time` (relative time)
5. `now` (NOW PLAYING pill — only if `active`)

The primitive is responsible for inserting the dot separators. Call sites pass an array; ordering is normalized inside.

There is no `page` / `P#` bit. Bilibili multi-`p` videos already have `P{n} {part}` baked into their title (the parser does this for us — see `fetchBilibiliMeta` in `parser.ts`), so a separate badge would duplicate the same information.

**Why fixed order:** Different orderings across surfaces is exactly the inconsistency the user wants killed. If a future need arises for a different ordering, that's a `SongCard` change, not a per-surface override.

### Decision: Cover thumbnail with generic-placeholder fallback

A new `<CoverThumb source videoId />` component lives next to `SongCard` and renders an `<img>` whose `src` is the cover URL for the given `(source, videoId)`. The URL choice:

- For YouTube: `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg` works directly.
- For Bilibili: hot-linking `i*.hdslb.com` is unreliable — depending on the deployed environment we either go through `/api/thumb?source=bili&id=<videoId>` (302 redirect today, byte-streaming with cache once the in-flight `thumbnail-cache` change lands) or rely on a stored `thumb` URL on the song.

On `<img onError>` (load failure, CORS block, 4xx, etc.), or when no URL is computable, `<CoverThumb>` renders a **generic placeholder tile** — a dimmed card-toned square the same size as a successful image, with no inner text/number/badge. The user explicitly rejected the previous "show row number as fallback" approach: row indices aren't useful information, and the placeholder should be visually quiet rather than informative.

**History AND Catalog both use `<CoverThumb>`.** Originally only History was wired up; the user reviewed and asked for covers in the favorites modal too — they're the strongest visual cue for spotting a starred song at a glance. Queue still passes `cover={null}` (no need; the queue is local to one room and rows are short-lived).

### Decision: Every row button is an `IconBtn` — no text labels

Every button that appears inside a SongCard's actions slot — star (favorite), top (move-to-top), trash (delete), History's replay, Catalog's "+ to queue" — renders through the existing `IconBtn` component (`.icon-btn` class: 30×30 square, line-bordered, `--ink-dim` glyph). The bespoke `StarBtn` (smaller, transparent, yellow when filled), the `.cat-add` pill ("+ 加入" with letter-spaced display font), and the `.hist-readd` chip ("+ REPLAY") are all removed in favour of icon-only IconBtn renderings.

- Catalog: a `+` icon (`Glyph.plusSm`). On a successful add the icon swaps to a check (`Glyph.check`) and the button picks up the `.icon-btn.is-flash` cyan tint for ~1.3s before reverting.
- History: a curved-arrow replay icon (`Glyph.replay`).
- Star: outline glyph empty, filled glyph when starred. The filled glyph renders in `var(--ink)` (white) — not yellow.

**Why no text:** the user explicitly asked for icon-only buttons. Text labels were inconsistent across surfaces ("+ 加入" vs "+ REPLAY") and visually competed with the title above. Icons read at a glance and let the action area shrink to a uniform 30×30 grid.

`IconBtn` is extended with an optional `className` prop so callers (Catalog flash) can compose state classes onto the chrome without defining their own button.

### Decision: Unified pink-gradient hover frame

Every interactive button on a song-card surface — `.icon-btn`, plus the side-panel `+` and 📚 (`.side-action`) — renders a unified hover treatment: a **1.5px pink gradient ring** (light → deep, 135deg) around the button's perimeter, plus a soft outer glow. The frame is rendered via an `::after` pseudo-element absolutely positioned at `inset: -1px` with `padding: 1.5px`, painted with a `linear-gradient` background and clipped via `mask-composite: exclude` so only the 1.5px-thick ring is visible — the button's interior is untouched.

Implementation:

```css
.icon-btn:hover:not(:disabled)::after,
.side-action:hover:not(:disabled)::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1.5px;
  background: linear-gradient(135deg,
    rgba(255, 46, 166, 0.35), rgba(255, 46, 166, 0.95));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
}
```

Each target button gets `position: relative` so the absolute pseudo anchors correctly, and inherits its parent's `border-radius` so the ring tracks rounded corners.

**Why frame-only, no inner colour change:** the user asked specifically for the hover effect to colour only the outer edge — the inner glyph keeps its existing colour (e.g. trash button's glyph stays neutral `--ink-dim`, the filled star stays `--ink`). This is exactly what the mask-composite ring achieves.

**Per-tint hover variants** (`icon-pink` / `icon-cyan`) survive only on the now-playing bar's transport buttons (prev/next/shuffle), which aren't on song-card rows. Row buttons get the unified pink frame regardless of the previous tint.

### Decision: Uniform row min-height of 72px

`min-height: 72px` on `.song-card`. With 10px top/bottom padding (= 20px), the inner content area is 52px — enough for a 2-line clamped title (2×17.55px = 35.1px) + 2px gap + 1-line meta (~13px) = ~50px, with a hair of breathing room. The 48px cover (when present) sits inside the same 52px content area without forcing expansion.

**Why uniform:** the user explicitly asked that all surfaces match History's height with no overflow. Without a min-height the Queue (no cover) would render shorter than History/Catalog (with covers); with this min-height all three surfaces render at exactly 72px regardless of cover presence or title length.

### Decision: CSS namespace `.song-card`

Single root class `.song-card`. State modifiers via additional classes: `.is-active`, `.is-dragging`, `.is-drop-target`. Inner element classes: `.song-card-prefix`, `.song-card-body`, `.song-card-title`, `.song-card-sub`, `.song-card-actions`, plus typed meta-bit classes `.song-card-by`, `.song-card-src`, `.song-card-page`, `.song-card-now`.

The legacy namespaces (`.q-row*`, `.hist-row*`, `.cat-row*`) are deleted. The numbered-index in history becomes `.song-card-prefix` styled identically to today's `.hist-num`.

### Decision: Container variants — none. Flex slots, grid when cover is present.

Layout: `display: flex; align-items: center;` on `.song-card`, with `.song-card-body { flex: 1; min-width: 0; }` taking the centre column. `.song-card-actions` sits on the right.

When `cover` is non-null we use `display: grid; grid-template-columns: 48px 1fr auto;` so the cover image takes a fixed 48px square left column. Otherwise plain flex with no left gutter. The 48px width is a small bump from today's `.hist-num` 32px column — wide enough to read the cover image at a glance without overwhelming the row.

This avoids the temptation of per-surface variants by making the layout reactive to the slot inputs.

### Decision: Drag-and-drop stays at the call site

Today the queue's drag wrappers (`onDragStart`, `onDragOver`, `onDrop`) live in `app.jsx` *around* `QueueRow`. They keep doing that — `SongCard` doesn't know about drag. The call site sets `dragging` / `dropTarget` flags based on its local React state. Pulling drag into `SongCard` would couple a queue-only behavior into a primitive used by three surfaces; not worth it.

### Decision: `QueueRow` keeps existing public name as a thin wrapper

`window.KTV.UI.QueueRow` stays exported and keeps its current props (`song, idx, isCurrent, onTop, onDelete, onToggleFavorite, isFavorited`). Internally it just composes a `SongCard`. This keeps `app.jsx`'s call site untouched and avoids a coordinated refactor of the drag wrappers.

History and Catalog don't have public wrappers — they're inline in their respective files — so they call `SongCard` directly.

## Risks / Trade-offs

- **[Risk]** Bilibili cover images frequently fail to hot-link — `i*.hdslb.com` rejects cross-origin requests in many browsers. → **Mitigation:** `<CoverThumb>` always wires up `onError`, and the placeholder tile is dimensions-stable, so the worst case is a blank square (not a layout shift, not a broken-image icon). The in-flight `thumbnail-cache` change will eventually back `/api/thumb` with cached bytes; until then, History rows with Bili songs will commonly show the placeholder, which is acceptable.
- **[Risk]** Queue rows visually shift to History's smaller / dimmer typography — anyone used to today's brighter Queue may notice. → **Mitigation:** explicit user direction. Documented as the typography baseline decision.
- **[Risk]** Filled star going from yellow to white loses the colour-cue that "this song is favorited" — the only signal becomes the filled-vs-outline glyph. → **Mitigation:** the user requested this. The filled star is still distinguishable at a glance and the `disabled` state on the IconBtn (no hover transform) gives a secondary signal.
- **[Risk]** Removing the `P#` badge means power users who relied on the badge to spot multi-page videos lose a glanceable signal. → **Mitigation:** the title already includes `P{n} {part}`, and that's where the user explicitly says the information lives.
- **[Risk]** Today's `q-row-active` glow is pink-themed; History and Catalog never had an active state. The unified `.is-active` style ports the pink glow to all three surfaces. → **Mitigation:** only Queue ever sets `active=true` in practice. History's currently-playing song lives in `room.current`, not `room.history`, so no row will ever set the flag there. Catalog sets it for any row whose `(source, videoId, page)` matches `room.current` (a tiny new behaviour the user probably welcomes); if not, the catalog call site can just not pass the flag.
- **[Trade-off]** A typed `meta` array is more verbose at call sites than today's hand-rolled spans. We accept that — the verbosity is the contract that prevents future drift.

## Migration Plan

1. Add `SongCard` and `<CoverThumb>` to `app-ui.jsx` exports without removing the legacy code.
2. Update `IconBtn` styling: drop `icon-pink` / `icon-cyan` hover variants in favour of the neutral default; introduce a filled-star glyph that uses `var(--ink)`.
3. Add `.song-card*` CSS rules using History's typography values. Don't delete the legacy namespaces yet.
4. Migrate `CatalogModal` first (smallest blast radius, no cover, no drag) — verify visually.
5. Migrate `HistoryList` — wire `<CoverThumb>` into the cover slot, drop the `.hist-num` index column, verify the `+ REPLAY` button still flashes / replays correctly. Confirm the placeholder fallback fires for Bili rows whose hot-link is blocked.
6. Migrate `QueueRow` last (drag, currently-playing border, top/trash) — verify drag-to-reorder + drop targets, confirm Queue's typography matches History's.
7. Once all three are on `SongCard`, delete the legacy `.q-row*` / `.hist-row*` / `.cat-row*` rules and the bespoke `.star-btn` rules in a single follow-up edit.
8. Hard-reload the deployed app, eyeball the three surfaces side by side. No backend restart needed (frontend-only refactor; backend per-route data is unchanged).

## Open Questions

- Do we want a duration badge (e.g. "3:42") in the meta line? Today none of the surfaces show duration. Out of scope here, but the slot model leaves room.
- Should the catalog show a small "in queue now" indicator when the song is currently playing? Easy free addition once `active` is wired through.
