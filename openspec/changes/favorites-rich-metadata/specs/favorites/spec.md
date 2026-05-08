## ADDED Requirements

### Requirement: Optional manual metadata on favorites

Each favorite row SHALL carry three optional manual-metadata fields, in addition to the existing canonical fields (`source`, `videoId`, `page`, `title`, `thumb`, `duration`, `addedBy`, `addedAt`):

- `displayTitle` (string, optional): the user's canonical song name. Convention: simplified Chinese for any CN segments, English left as-is. When set, it overrides the raw `title` for display purposes; the raw `title` is still preserved on the row as the imported original.
- `authors` (string[], optional): one or more credited people (singer / composer / lyricist / etc.). When present, the array SHALL contain ≥1 entry; an empty array MUST NOT be stored.
- `mode` (`"instr"` | `"vocal"`, optional): `"instr"` = 伴奏 (instrumental / karaoke), `"vocal"` = 原唱 (original-vocal). Any other value MUST be rejected by the persistence layer.

All three fields SHALL default to absent for newly-added favorites; v1 has NO WebSocket message for editing them. The user is expected to populate them by editing the SQLite database directly.

#### Scenario: Newly-added favorite has no manual metadata

- **WHEN** any client sends `favorite.add` for a new song
- **THEN** the persisted row SHALL have `displayTitle`, `authors`, `mode` all absent (NULL in storage), and the broadcast `favorites` snapshot SHALL reflect that absence

#### Scenario: User SQL-edits manual metadata

- **WHEN** the operator runs e.g. `UPDATE favorites SET display_title='小镇姑娘', authors='["陶喆"]', mode='instr' WHERE source='bili' AND video_id='BVxxx' AND page=0;`
- **THEN** the next `favorites` snapshot delivered to any connecting client SHALL include those three fields populated, and the row's raw `title` field SHALL be unchanged

### Requirement: Structured-title display for favorites with manual metadata

The frontend SHALL provide a single helper, used by every UI site that renders a song title (queue rows, history rows, catalog rows, now-playing bar), that decides between the structured form and the raw title for a given song:

- If the song's `(source, videoId, page)` is present in the global favorites snapshot AND that favorite row has at least one of `displayTitle` / `authors` (non-empty) / `mode` populated → render the **structured form**:

  `[伴奏 | 原唱] · [曲名] · [作者1, 作者2]`

  with these composition rules:
    1. The `[伴奏 | 原唱]` segment is included iff `mode` is set; `"instr"` renders as `伴奏`, `"vocal"` renders as `原唱`. If `mode` is absent the segment AND its trailing ` · ` separator are omitted.
    2. The `[曲名]` segment is `displayTitle` if set, else the raw `title`. It is always present.
    3. The `[作者1, 作者2]` segment is the `authors` array joined by `, ` (Chinese-friendly comma followed by space). If `authors` is absent or empty the segment AND its leading ` · ` separator are omitted.

- Otherwise (song is not favorited, or its favorite has no manual metadata at all) → render the raw `title` unchanged.

The helper SHALL NOT mutate the underlying `Song` or `Favorite` records. The structured string is a render-time computation only.

#### Scenario: Favorite with all three fields populated

- **WHEN** a favorite has `displayTitle="小镇姑娘"`, `authors=["陶喆"]`, `mode="instr"`
- **THEN** every UI site rendering this song's title SHALL show `伴奏 · 小镇姑娘 · 陶喆`

#### Scenario: Favorite with only displayTitle and authors

- **WHEN** a favorite has `displayTitle="小镇姑娘"`, `authors=["陶喆","蔡依林"]`, `mode` absent
- **THEN** the rendered title SHALL be `小镇姑娘 · 陶喆, 蔡依林` (no leading mode segment, no leading ` · `)

#### Scenario: Favorite with only mode

- **WHEN** a favorite has `mode="vocal"`, `displayTitle` absent, `authors` absent
- **THEN** the rendered title SHALL be `原唱 · <raw title>` (mode + raw title, no trailing authors segment)

#### Scenario: Favorite with no manual metadata falls through to raw title

- **WHEN** a favorite has `displayTitle`, `authors`, `mode` all absent
- **THEN** the rendered title SHALL equal `song.title` exactly (same behavior as a non-favorited song)

#### Scenario: Non-favorited song uses raw title

- **WHEN** a song is in the queue / history / now-playing but its `(source, videoId, page)` is NOT in the favorites snapshot
- **THEN** the rendered title SHALL equal `song.title` exactly, and the helper SHALL NOT consult favorites

### Requirement: Server preserves manual metadata across `favorite.add` retries

If a row already exists in `favorites` with manual metadata populated, a subsequent `favorite.add` for the same `(source, videoId, page)` SHALL be a no-op for the manual fields — the existing `displayTitle`, `authors`, `mode` SHALL be preserved exactly as they were (consistent with the existing "first starrer wins" rule for `addedBy` / `addedAt`).

#### Scenario: Re-favorite does not clobber manual edits

- **WHEN** the operator has SQL-edited a row's `display_title`, `authors`, `mode`, and a different user later sends `favorite.add` for that same key
- **THEN** the row's `display_title`, `authors`, `mode` SHALL be unchanged; only the broadcast `favorites` snapshot is re-sent
