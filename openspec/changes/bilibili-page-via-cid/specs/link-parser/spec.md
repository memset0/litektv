## ADDED Requirements

### Requirement: Bilibili parsed metadata carries the per-page cid

For Bilibili sources, the parsed-metadata response from `POST /api/parse-link` (and the equivalent path through `parseRef`) SHALL include an optional `cid: number` field set to the `cid` of the **requested page** (defaulting to page 1's `cid` for single-part videos). The `cid` SHALL be sourced from the `pages: [{cid, page, part, duration}]` array on the upstream `api.bilibili.com/x/web-interface/view` response. When the upstream call fails, the field MAY be omitted; downstream consumers SHALL handle its absence gracefully.

The field SHALL NOT be set for YouTube sources.

#### Scenario: Multipart Bilibili URL with ?p=4

- **WHEN** the request body is `{"url":"https://www.bilibili.com/video/BV1TN4y187xe?p=4"}`
- **THEN** the response SHALL include `source:"bili"`, `videoId:"BV1TN4y187xe"`, `page:4`, AND `cid:<the cid of page 4 from the upstream pages[] array>`

#### Scenario: Single-part Bilibili URL with no ?p=

- **WHEN** the request body is `{"url":"https://www.bilibili.com/video/BV1uv411q7Mv"}`
- **THEN** the response SHALL include `source:"bili"`, `page:1`, AND `cid:<the cid for page 1 / the only page>`

#### Scenario: Upstream Bilibili API call fails

- **WHEN** the upstream `/x/web-interface/view` returns a non-zero `code` or times out
- **THEN** the response SHALL still carry `source` + `videoId` + `page`, but `cid` MAY be absent

#### Scenario: YouTube source

- **WHEN** the request body is `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`
- **THEN** the response SHALL NOT carry a `cid` field

### Requirement: Embed URL prefers cid over page for Bilibili playback

The frontend's `embedUrl(song)` helper SHALL build Bilibili player iframe URLs with the most precise page-selector parameter the song record carries. Specifically, in priority order:

1. If `song.cid` is set (non-zero, non-undefined), the URL SHALL include `&cid=${song.cid}` and SHALL NOT include `&p=` or `&page=`.
2. Otherwise, the URL SHALL include `&p=${song.page || 1}` and SHALL NOT include `&page=` (the legacy `page=N` parameter is dropped because Bilibili's current player no longer honors it reliably).

The `bvid` / `aid` parameter is unchanged and accompanies whichever selector is used.

#### Scenario: Song record has cid

- **WHEN** `embedUrl({source:"bili", videoId:"BV1TN4y187xe", page:4, cid:1234567})` is called
- **THEN** the returned URL SHALL contain `bvid=BV1TN4y187xe` AND `cid=1234567`
- **AND** the URL SHALL NOT contain `p=` or `page=`

#### Scenario: Song record lacks cid (legacy data)

- **WHEN** `embedUrl({source:"bili", videoId:"BV1TN4y187xe", page:4})` is called (no `cid`)
- **THEN** the returned URL SHALL contain `bvid=BV1TN4y187xe` AND `p=4`
- **AND** the URL SHALL NOT contain `cid=` or `page=`

#### Scenario: Song record has no page either

- **WHEN** `embedUrl({source:"bili", videoId:"BV1uv411q7Mv"})` is called (no `page`, no `cid`)
- **THEN** the returned URL SHALL contain `bvid=BV1uv411q7Mv` AND `p=1` (default)
