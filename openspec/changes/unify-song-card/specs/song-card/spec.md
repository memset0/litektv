## ADDED Requirements

### Requirement: Single SongCard primitive renders every song row

Every song-row-shaped element in the side panel — Queue rows, History rows, and the My Songs (catalog) modal rows — SHALL be rendered through a single shared `SongCard` UI primitive (exported as `window.KTV.UI.SongCard`). Surfaces SHALL NOT hand-roll their own row markup.

#### Scenario: All three surfaces render through the same primitive

- **WHEN** the Queue, History, and Catalog modal each render a song row
- **THEN** each row's outermost element SHALL carry the `song-card` CSS class and SHALL be produced by the same `SongCard` component, with no surface defining its own competing row markup

#### Scenario: A new song-row surface lands

- **WHEN** a future feature introduces a new place that displays song rows (e.g. a search results list)
- **THEN** that surface SHALL also render through `SongCard` rather than inventing its own row component

### Requirement: SongCard exposes cover / title / meta / actions slots

The `SongCard` primitive SHALL expose exactly four content slots:

- `cover` — optional left-side ReactNode (a `<CoverThumb>` image or null). Hidden when null/undefined. The slot is named `cover` rather than the more generic `prefix` because the only thing this column is allowed to hold is a cover image (or its placeholder); arbitrary numbering / index columns are not permitted (see "No numerical index" requirement).
- `title` — string, rendered as the row's primary text, clamped to two lines.
- `meta` — array of typed meta bits (see canonical ordering below). Rendered as a single secondary line.
- `actions` — opaque ReactNode rendered on the right side of the row.

The `actions` slot SHALL be **opaque to `SongCard`** — `SongCard` lays it out (right-aligned, vertically centred, with consistent gap/padding) but applies no constraints on what buttons appear inside. This is intentional: each surface has a different action bar (Queue: star/top/trash, History: star/REPLAY, Catalog: + 加入) and that latitude is preserved. `SongCard` SHALL NOT impose a uniform action set across surfaces — only the row chrome (padding, gap, alignment, vertical centring) is unified.

#### Scenario: Each surface passes its own action bar

- **WHEN** Queue renders a row
- **THEN** it SHALL pass `<StarBtn />`, the move-to-top icon, and the trash icon as `actions` children
- **AND WHEN** History renders a row
- **THEN** it SHALL pass `<StarBtn />` and the `+ REPLAY` button as `actions` children
- **AND WHEN** Catalog renders a row
- **THEN** it SHALL pass the `+ 加入` button as `actions` children
- **AND** in all three cases `SongCard` SHALL render its action area with identical alignment, gap, and right-edge padding regardless of what's inside

#### Scenario: Cover slot is null on Queue and Catalog rows

- **WHEN** Queue or Catalog renders a row
- **THEN** it SHALL pass `cover={null}` (or omit the prop) and `SongCard` SHALL render the row without a left cover column
- **AND WHEN** History renders a row
- **THEN** it SHALL pass `cover={<CoverThumb source={s.source} videoId={s.videoId} />}` and `SongCard` SHALL render that as a fixed-width left column

### Requirement: Cover thumbnail with generic placeholder fallback

History rows SHALL render the song's cover thumbnail in the cover slot. The frontend SHALL provide a `<CoverThumb>` component that:

- Renders an `<img>` whose `src` is the cover URL for the given `(source, videoId)` (e.g. via the existing `/api/thumb?source=...&id=...` route, or a direct YouTube `i.ytimg.com` URL for `yt`).
- On image load failure (`onError`), or when no cover URL is available for the source, SHALL render a **generic placeholder** instead — a quiet card-toned tile sized to the cover slot, with NO numerical index, NO row number, and NO surface-identifying badge. The placeholder SHALL have the same dimensions as a successfully-loaded cover so the row's layout does not shift.

#### Scenario: Cover image fails to load

- **WHEN** a History row's cover URL returns a non-OK response or the image fails to decode
- **THEN** the row SHALL render the generic placeholder tile in the cover slot
- **AND** the row's height and the column widths SHALL be unchanged compared to a successful load

#### Scenario: Source has no known cover URL

- **WHEN** a History row's `(source, videoId)` has no cover endpoint defined
- **THEN** `<CoverThumb>` SHALL skip the image fetch and render the placeholder directly

### Requirement: No numerical index in the cover slot

The cover slot SHALL NOT carry a numerical index, row number, or sequence label. The previous History behaviour of rendering a 2-digit index (e.g. `"05"`) in the row's left column SHALL be removed — the row index is not load-bearing information for the user, and a cover image (or its placeholder) replaces it entirely.

#### Scenario: Inspecting a History row

- **WHEN** the user views the History tab
- **THEN** no row SHALL display a numerical index in any column
- **AND** the row SHALL show only the cover (or its placeholder), the title, the meta line, and the action bar

### Requirement: Canonical meta-line ordering

`SongCard` SHALL render its `meta` bits in a fixed canonical order, regardless of the order in which the caller supplied them. The order SHALL be:

1. `src` (source-tag pill: "YT" or "Bili")
2. `by` (`<emoji> <name>` of the relevant user — favoriter for Catalog, queuer for Queue/History)
3. dot separator (auto-inserted by `SongCard` between `by` and `time` when both are present)
4. `time` (relative time like "5m ago")
5. `now` (`▶ NOW PLAYING` pill — rendered only when the row's `active` flag is true)

Surfaces SHALL declare which bits they want via the `meta` array; ordering SHALL NOT be configurable per call site.

There SHALL NOT be a `page` / `P#` meta bit. Bilibili multi-`p` videos already carry the `P{n} {part}` suffix in the title (the parser folds it in), so a separate page badge would be redundant.

#### Scenario: Catalog and Queue render the same bits in the same order

- **WHEN** Catalog renders a row with `meta = [{kind:"src", source:"bili"}, {kind:"by", name:"Alice", emoji:"🎤"}, {kind:"time", ts}]`
- **AND** Queue renders a row with `meta = [{kind:"by", name:"Alice", emoji:"🎤"}, {kind:"time", ts}, {kind:"src", source:"bili"}]` (different input order)
- **THEN** both rows SHALL display the bits in the canonical order: src first, then by, then time

#### Scenario: Bilibili multi-p title carries the page info

- **WHEN** a song's title is `Original - P2 PartName` (the parser-supplied form)
- **THEN** `SongCard` SHALL render the title as-is, and SHALL NOT additionally render a `P2` badge on the meta line

### Requirement: Visual states are flag-driven

`SongCard` SHALL accept boolean visual-state props `active`, `dragging`, and `dropTarget`. The default rendering, plus each of these three states, SHALL share the same base layout — only border, background, and opacity change. Call sites SHALL set flags; they SHALL NOT add inline styles or alternative class names to alter the row's appearance.

- `active` — currently-playing emphasis (pink border + glow). Used by Queue's currently-playing row.
- `dragging` — dimmed + dashed border. Used by the queue's drag-and-drop wrappers when this row is the source of the drag.
- `dropTarget` — drop-target highlight. Used by the queue's drag-and-drop wrappers when a different row is being dragged over this one.

#### Scenario: Active flag controls the now-playing border

- **WHEN** Queue renders the currently-playing row with `active={true}`
- **THEN** the row SHALL render with the pink active border + glow
- **AND WHEN** the row no longer matches `room.current` and `active={false}`
- **THEN** the row SHALL revert to the default border

#### Scenario: Drag flags drive the queue's reorder visuals

- **WHEN** the user picks up a queue row, `dragging={true}` is passed to that row's `SongCard`
- **AND** `dropTarget={true}` is passed to whichever row is currently under the cursor
- **THEN** `SongCard` SHALL render those rows with the dimmed-source and highlighted-target visuals respectively, using the same classes regardless of which surface the rows belong to

### Requirement: Typography baseline matches the existing History row

The visual baseline for `.song-card*` typography, padding, gap, and border SHALL be the values used by today's History row (`.hist-row` and friends in `ktv.css`). Specifically:

- Row container: `padding: 10px 12px`, `border-radius: 10px`, `border: 1px solid var(--line)`, `background: var(--card)`, `gap: 10px` between cover / body / actions columns.
- Title: `font-weight: 600`, `font-size: 13px`, `color: var(--ink-dim)`, two-line clamp (`-webkit-line-clamp: 2`), `line-height: 1.35`, `word-break: break-word`.
- Meta line: `font-size: 11px`, `color: var(--ink-mute)`, `gap: 6px` between bits.

The brighter / larger Queue typography (`font-size: 13.5px`, `color: var(--ink)`, `--pad`-based padding) SHALL NOT be used. Queue rows visually shift to the History baseline — this is part of the intentional unification.

#### Scenario: Queue row adopts History's typography after migration

- **WHEN** the migration to `SongCard` completes
- **THEN** a Queue row's title SHALL render at 13px / `--ink-dim` / 600 weight (the History baseline), NOT at 13.5px / `--ink` (the previous Queue values)

### Requirement: Common action buttons share the trash button's base shape

The three action buttons that may appear inside a `SongCard` actions slot — **add to favorite (star)**, **stick to top**, and **delete (trash)** — SHALL all render with the same base shape: the existing `.icon-btn` styling used by the delete button today (30×30 square box, 8px border-radius, line-colored 1px border, transparent background, `var(--ink-dim)` glyph colour, neutral hover).

Specifically:

- The star button SHALL render through `IconBtn` rather than the current bespoke `StarBtn` markup. The previous 26×26 unbordered transparent treatment SHALL be removed; the filled and empty states SHALL share the `.icon-btn` chrome and only the inner SVG glyph differs (filled vs outline star).
- The per-tint hover variants (`icon-pink`, `icon-cyan`) SHALL be retired in favour of a single neutral hover, so the three buttons no longer signal intent through colour. Any caller that needs a destructive emphasis SHALL rely on `window.confirm(...)` (already required for delete) rather than colour.
- Sizing remains 30×30 at desktop densities and the existing responsive shrinks (28×28 / 26×26) continue to apply uniformly to all three buttons.

#### Scenario: Star, top, and trash render as the same chrome

- **WHEN** the user inspects a Queue row's action bar
- **THEN** all three buttons SHALL share the same outer dimensions, border, border-radius, default colour, and hover treatment
- **AND** the only visual difference between buttons SHALL be the inner SVG glyph

#### Scenario: Star button does not have its old unbordered look

- **WHEN** the migration completes
- **THEN** no DOM element SHALL match a `.star-btn` rule that gives it a transparent / unbordered / 26×26 appearance
- **AND** every star icon in the app SHALL render inside an `.icon-btn` container

### Requirement: Filled star uses ink, not yellow

When a star button is in its "filled" (already-favorited) state, the inner glyph SHALL be coloured `var(--ink)` (white) rather than the previous neon-yellow. The `.icon-btn` chrome around it SHALL remain identical to the empty state (same border, same background, same hover) — only the inner SVG fill changes.

The neon-yellow treatment with `text-shadow` glow SHALL be removed from the filled star.

#### Scenario: A favorited row's star renders white

- **WHEN** the user views a row whose `(source, videoId, page)` is present in the global favorites
- **THEN** the row's star button SHALL render with the filled-star SVG in `var(--ink)` colour
- **AND** the button SHALL NOT emit any yellow glow / text-shadow

### Requirement: Single CSS namespace `.song-card*`

All styling for the unified row SHALL live under a single CSS namespace prefixed `.song-card`. The previously-separate namespaces (`.q-row*`, `.hist-row*`, `.cat-row*`) SHALL be removed. State modifiers SHALL be expressed as additional classes on the root element (`.song-card.is-active`, `.song-card.is-dragging`, `.song-card.is-drop-target`).

#### Scenario: Inspecting any song-row in DevTools

- **WHEN** a developer inspects a Queue, History, or Catalog row in DevTools
- **THEN** the outermost element SHALL have class `song-card` (plus optional state modifiers and the surface-agnostic typed meta-bit classes)
- **AND** there SHALL be no `q-row`, `hist-row`, or `cat-row` class names anywhere in the rendered DOM

## MODIFIED Requirements

### Requirement: Uniform row dimensions

Every Queue row, History row, and Catalog row SHALL render with a fixed minimum height that comfortably fits a 2-line clamped title plus a 1-line meta row. The title and meta SHALL be vertically centered inside the row regardless of how many lines the title actually takes. Because all three surfaces render through `SongCard`, this constraint SHALL be expressed exactly once (in `.song-card*` CSS) rather than being duplicated per surface.

#### Scenario: Short title and long title render at the same height

- **WHEN** one row's title fits on a single line and another wraps to two lines
- **THEN** both rows SHALL have the same height; the short-title row's content SHALL be vertically centered with empty space above and below

#### Scenario: Same height across surfaces

- **WHEN** a Queue row, a History row, and a Catalog row are visible side-by-side in the side panel (e.g. by switching tabs)
- **THEN** rows whose titles wrap to the same number of lines SHALL render at identical heights — the surface SHALL NOT change the row's vertical metrics

### Requirement: Thumbnails on song-card surfaces

History rows SHALL render the song's cover thumbnail in the cover slot, with a generic placeholder fallback when the cover URL fails to load or no cover URL is known. Queue and Catalog rows SHALL render no cover (their cover slot is null). The `thumb` field on song records is a hint; `<CoverThumb>` MAY use it directly, or use the canonical `/api/thumb?source=...&id=...` route, or compute the YouTube `i.ytimg.com/vi/<id>/hqdefault.jpg` URL — call site choice. The placeholder SHALL be image-load-failure-safe: a Bilibili `i*.hdslb.com` URL the browser refuses to hot-link SHALL trigger the placeholder rather than a broken-image artifact.

#### Scenario: Bilibili row whose hot-link is blocked

- **WHEN** a History row's cover URL is a Bilibili `http://i*.hdslb.com` URL that the browser refuses to load
- **THEN** the History row SHALL render the generic placeholder tile in the cover slot, NOT a broken-image icon
- **AND** the row's layout SHALL be unchanged (same height and column widths as a successful load)

#### Scenario: Queue and Catalog rows have no cover slot

- **WHEN** the user views Queue or Catalog
- **THEN** no row SHALL render a cover image or cover placeholder
- **AND** rows on those surfaces SHALL render with the body column starting at the row's left padding (no cover column, no left gutter)
