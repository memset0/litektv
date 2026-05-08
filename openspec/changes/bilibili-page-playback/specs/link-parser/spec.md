## ADDED Requirements

### Requirement: Bilibili page parameter is honored at playback

For a Bilibili song with `page` populated (`page >= 1`), the embed URL constructed by the frontend SHALL include `page=<N>` so the `player.bilibili.com` iframe selects the requested sub-clip. The default when `page` is absent or `1` SHALL be the first part (which is also the iframe's default behavior).

This closes the loop on the existing parsing requirements: the parser already extracts `?p=N`, fetches per-page title and duration, and persists `page` in the song record; this requirement makes sure the same `page` reaches the actual player.

#### Scenario: User queues a multipart Bilibili link with ?p=2

- **WHEN** a user pastes `https://www.bilibili.com/video/BV1ir4y1u7om?p=2` (with or without tracking params like `spm_id_from`, `vd_source`)
- **THEN** the parsed song record SHALL carry `page: 2`, the title SHALL include `- P2 <part name>`, and the embed URL SHALL contain `page=2`
- **AND** every connected client SHALL play the P2 sub-clip, not P1

#### Scenario: Song without a page field falls back to P1

- **WHEN** a Bilibili song with no `page` (or `page === 1`) is rendered
- **THEN** the embed URL SHALL still be valid and the iframe SHALL play the first part (`page=1` or omitted — both produce P1)
