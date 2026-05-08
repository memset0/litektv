## MODIFIED Requirements

### Requirement: SongCard exposes cover / title / meta / actions slots

The `SongCard` primitive SHALL expose exactly four content slots:

- `cover` — optional left-side ReactNode (a `<CoverThumb>`, the new now-playing plate, or null). Hidden when null/undefined. The slot is named `cover` rather than the more generic `prefix` because the only thing this column is allowed to hold is a cover image (or its placeholder, or — in the queue's pinned current row — a "now playing" plate that visually replaces the cover); arbitrary numbering / index columns are not permitted (see "No numerical index" requirement).
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

#### Scenario: Every surface renders a cover (or its replacement)

- **WHEN** Queue, History, or Catalog renders a non-current pending row
- **THEN** it SHALL pass `cover={<CoverThumb source={s.source} videoId={s.videoId} />}` and `SongCard` SHALL render that as a fixed-width left column
- **AND WHEN** Queue renders the pinned current row (the song the room is currently playing)
- **THEN** it SHALL pass a now-playing plate as the cover content and `SongCard` SHALL render it in the same fixed-width left column with identical dimensions, so the row's overall metrics match a normal cover row

### Requirement: Cover thumbnail with generic placeholder fallback

Queue rows, History rows, AND Catalog rows SHALL render the song's cover thumbnail in the cover slot. The frontend SHALL provide a `<CoverThumb>` component that:

- Renders an `<img>` whose `src` is the cover URL for the given `(source, videoId)` (e.g. via the existing `/api/thumb?source=...&id=...` route, or a direct YouTube `i.ytimg.com` URL for `yt`).
- On image load failure (`onError`), or when no cover URL is available for the source, SHALL render a **generic placeholder** instead — a quiet card-toned tile sized to the cover slot, with NO numerical index, NO row number, and NO surface-identifying badge. The placeholder SHALL have the same dimensions as a successfully-loaded cover so the row's layout does not shift.

The pinned current queue row is the one exception: its cover slot is occupied by the now-playing plate, NOT a `<CoverThumb>` (see queue-controls capability for the pinned-row contract). The plate's dimensions SHALL match the `<CoverThumb>` dimensions so the row metrics are unaffected.

#### Scenario: Cover image fails to load

- **WHEN** a Queue, History, or Catalog row's cover URL returns a non-OK response or the image fails to decode
- **THEN** the row SHALL render the generic placeholder tile in the cover slot
- **AND** the row's height and the column widths SHALL be unchanged compared to a successful load

#### Scenario: Source has no known cover URL

- **WHEN** a row's `(source, videoId)` has no cover endpoint defined
- **THEN** `<CoverThumb>` SHALL skip the image fetch and render the placeholder directly

#### Scenario: Pinned current queue row uses the plate, not a CoverThumb

- **WHEN** the queue renders the pinned current row
- **THEN** the cover slot SHALL contain the now-playing plate element (not a `<CoverThumb>` and not the placeholder); the plate's bounding box SHALL match `<CoverThumb>` dimensions so all three row types (queue / history / catalog) have identical row heights
