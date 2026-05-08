## Why

Today three different surfaces in the side panel render a song-card-shaped row, each with its own JSX tree, its own CSS namespace, and small-but-visible drift in typography, vertical spacing, hover state, and meta-line ordering:

- **Queue** — `QueueRow` in `app-ui.jsx`, CSS prefixed `.q-row` / `.q-meta` / `.q-sub` / `.q-actions`. Sub-line: `emoji name · time [▶ NOW PLAYING]`. Has hover + active border, draggable.
- **History** — inline rows in `HistoryList` (`app.jsx`), CSS prefixed `.hist-row` / `.hist-meta` / `.hist-sub` / `.hist-actions`. Has a left-side index number column. Sub-line: `emoji name · time + src-tag` (note: src-tag at the END, unlike Queue which has no src-tag at all).
- **My Songs (catalog)** — inline rows in `CatalogModal` (`catalog.jsx`), CSS prefixed `.cat-row` / `.cat-meta` / `.cat-sub` / `.cat-actions`. Sub-line: `src-tag [P2] [emoji name ·] time` (src-tag at the START).

Three near-identical components, three CSS namespaces, three slightly different meta-line orderings, three opportunities for drift. When we tweak the look (e.g. recently we added the `addedBy` field on favorites) we have to touch all three or accept a half-applied change. The user has noticed the inconsistency and asked us to consolidate.

## What Changes

- New **`SongCard`** UI primitive in `app-ui.jsx` that renders the shared layout: optional `cover` slot (left), single-line title (clamped to 2 lines), one meta line composed from typed bits, right-side `actions` slot. The component is the single source of truth for all song-card visuals.
- **Single `.song-card*` CSS namespace** in `ktv.css` replacing the three legacy namespaces. The old `.q-row*` / `.hist-row*` / `.cat-row*` rules are removed.
- **Typography baseline = History.** The unified card adopts the History row's existing values (title 13px / `--ink-dim` / weight 600, sub 11px / `--ink-mute`, padding `10px 12px`, border-radius 10px). Queue rows visually shift to this baseline — that's the user's stated preference and part of the unification.
- **History and Catalog both render cover thumbnails.** History's previous 2-digit row index is dropped (the user pointed out the index isn't load-bearing information); Catalog's previous "no cover" rule is also dropped — covers help recognize starred songs at a glance. A new `<CoverThumb>` component renders an `<img>` for the song's cover and falls back to a **generic placeholder tile** (no number, no badge) on load failure or when no cover URL is known. Queue still passes `cover={null}` (the row is busy enough with drag handle, drag wrappers, and three action buttons).
- **Meta line is composed from typed bits.** Bits: `{kind:"src", source}`, `{kind:"by", name, emoji}`, `{kind:"time", ts}`, `{kind:"now"}`. Canonical order is fixed inside `SongCard` regardless of input order. The previous `P#` / page badge is removed — Bilibili multi-`p` titles already carry `P{n} {part}` in the title text, so a separate badge is redundant.
- **State flags** on `SongCard`: `active` (currently playing), `dragging`, `dropTarget`. Replaces `q-row-active` and the queue's drag-wrapper class hooks.
- **Action buttons unified — every row button is an `IconBtn`.** Star (favorite), top (move-to-top), trash (delete), History's replay, and Catalog's "+ to queue" all render through the same 30×30 `IconBtn` chrome. **No text labels** on any of them — just icon glyphs (Catalog's "+ 加入" becomes a plus glyph, History's "+ REPLAY" becomes a curved-arrow replay glyph). The previous bespoke `StarBtn`, `.cat-add` pill, and `.hist-readd` text button are all gone. **The filled star uses `var(--ink)` (white)** — not yellow. The `.icon-btn.is-flash` modifier briefly paints the catalog row's button cyan after a successful add (icon swaps from plus → check during the flash window).
- **Unified pink-gradient hover frame on every row button.** All `.icon-btn` instances and the side-panel `.side-action` controls (`+`, 📚) share a single hover treatment: a 1.5px pink gradient ring (light → deep, 135deg) plus a soft outer glow. The frame is rendered via an `::after` pseudo with `mask-composite: exclude` so it never bleeds into the button's interior — each button keeps its own glyph colour. Per-tint hover variants (`icon-pink` / `icon-cyan`) are retired on row buttons; the transport bar's prev/next/shuffle keep theirs since those aren't row controls.
- **Migrate the three call sites** to `SongCard`:
  - `QueueRow` becomes a thin wrapper mapping queue concerns into `SongCard` props (top / trash / star, drag, `isCurrent` → `active`).
  - `HistoryList` rows become `SongCard` with a `<CoverThumb>` cover and `[star, replay-icon]` actions.
  - `CatalogModal` rows become `SongCard` **with a `<CoverThumb>` cover too** (covers help recognize starred songs at a glance), and a single `[plus-icon]` action. Meta bits land in the canonical order so `addedBy` and `src-tag` are placed identically to History/Queue.
- **Card height is uniform** across all surfaces — `min-height: 72px` so 2-line titles + the 1-line meta line fit without overflow regardless of whether the row carries a 48px cover.

## Capabilities

### New Capabilities

- `song-card`: the shared row primitive contract. Defines the slot model (prefix, title, meta bits, actions), the canonical meta-line ordering, and the visual states (default / hover / active / dragging / drop-target). All song-row surfaces in the app are required to render through it.

### Modified Capabilities

- `queue-controls`: queue rows, history rows, and the favorites catalog rows MUST be rendered via the unified `SongCard` primitive. The previously-separate row markup and CSS namespaces (`.q-row*`, `.hist-row*`, `.cat-row*`) are removed; visual divergence between the three surfaces collapses to the prefix and actions slots.

## Impact

- **Frontend**: new `SongCard` primitive (in `app-ui.jsx` or a new `song-card.jsx` module loaded before `app-ui.jsx`); `QueueRow` rewritten as a wrapper; `HistoryList` and `CatalogModal` rewritten to use `SongCard`. CSS consolidated under `.song-card*`. Drag-and-drop wrapper in `app.jsx` stays at the call site (it's queue-specific) but maps drag state to a `SongCard` flag.
- **Backend**: none. This is a pure UI refactor.
- **Storage**: none.
- **Testing**: manual visual diff before/after on all three surfaces. No backend tests touched.
- **Out of scope**: changing what backend data is rendered (we're only consolidating HOW the existing fields are presented; no new data model), reorganizing the side-panel tabs themselves, fetching/caching cover bytes (a separate `thumbnail-cache` change is in flight; this change uses whatever URL endpoint is current).
