# Link Parser

## Purpose

Translate user-pasted URLs (and messy share text) into normalized song metadata. Frontend MUST delegate parsing to the backend; client-side regex is only a degraded fallback when the backend is unreachable.
## Requirements
### Requirement: REST endpoint for parsing

The backend SHALL expose `POST /api/parse-link` accepting either `{url: string, userId?: string}` (`url` is treated as raw text up to 2048 chars; the parser extracts the URL itself) OR `{ref: {source, videoId, page?}, userId?: string}` for already-canonical references. The response SHALL be `{source, videoId, page?, title, thumb?, duration?}`. The response SHALL NOT echo any input field other than those keys.

#### Scenario: Direct YouTube URL

- **WHEN** the request body is `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`
- **THEN** the response SHALL be `{source:"yt", videoId:"dQw4w9WgXcQ", title, thumb}` with title fetched via oEmbed and a `hqdefault.jpg` thumbnail

#### Scenario: Direct Bilibili BV URL

- **WHEN** the request body is `{"url":"https://www.bilibili.com/video/BV1uv411q7Mv"}`
- **THEN** the response SHALL include `source:"bili"`, `videoId:"BV1uv411q7Mv"`, `page:1`, and the title/pic/duration returned by `api.bilibili.com/x/web-interface/view`

#### Scenario: Canonical ref input

- **WHEN** the request body is `{"ref":{"source":"yt","videoId":"dQw4w9WgXcQ"}}`
- **THEN** the response SHALL be `{source:"yt", videoId:"dQw4w9WgXcQ", title, thumb}` with no URL parsing performed

### Requirement: Tolerate messy share text

The parser SHALL extract the first `http(s)://...` URL out of the input before normalizing, so callers don't have to scrub Bilibili-style share strings.

#### Scenario: Bilibili share string with Chinese title prefix

- **WHEN** the request body is `{"url":"【在百万豪装录音棚大声听 陶喆《小镇姑娘》【Hi-res】-哔哩哔哩】 https://b23.tv/BV1uv411q7Mv"}`
- **THEN** the parser SHALL pick the embedded URL, resolve any redirect, and return the canonical Bilibili metadata

#### Scenario: Naked BV id in mixed text

- **WHEN** the request body is `{"url":"random text BV1uv411q7Mv more"}` (no http URL)
- **THEN** the parser SHALL fall back to scanning the input for a BV/av id and return it as `source:"bili"`

### Requirement: Short link redirect resolution

For `b23.tv` and equivalents, the backend SHALL follow HTTP redirects (using GET with a real browser User-Agent and a ≤6s timeout) up to 5 hops to reach the canonical URL.

#### Scenario: b23.tv 302 to bilibili.com/video/...

- **WHEN** the input URL is `https://b23.tv/<slug>` and the host returns a `302` with `Location: https://www.bilibili.com/video/BV.../...`
- **THEN** the parser SHALL follow the redirect and parse the destination URL

### Requirement: Frontend prefers the backend parser

The browser SHALL POST to `/api/parse-link` for every paste. Only on network/timeout failure SHALL it fall back to its in-page regex / public CORS-proxy resolver.

#### Scenario: Backend down, frontend degrades gracefully

- **WHEN** the backend `/api/parse-link` request times out
- **THEN** the frontend SHALL try `extractFromText` against the raw input and, for `b23.tv`, the legacy CORS-proxy resolver, returning at least `{source, videoId}` if anything matches

### Requirement: Best-effort metadata fallback

If metadata fetch fails (e.g. Bilibili API returns non-zero `code`), the response SHALL still carry `source` + `videoId` and a synthetic title (e.g. `"Bilibili BV..."`).

#### Scenario: Metadata fetch fails

- **WHEN** the BV id is valid but `api.bilibili.com/x/web-interface/view` returns an error
- **THEN** the response SHALL include `{source:"bili", videoId, title:"Bilibili <id>"}` so the queue still works

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

### Requirement: Canonicalization drops non-allowlisted query params

The parser SHALL ignore every URL query parameter except an explicit allowlist (`v` for YouTube watch URLs and `p` for Bilibili). The returned `ParsedSongMeta` SHALL only carry `{source, videoId, page?, title, thumb?, duration?}` and SHALL NOT include the original URL, the original query string, or any non-allowlisted parameter values.

#### Scenario: Bilibili share URL with tracking params

- **WHEN** `/api/parse-link` receives `{"url":"https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=6f64410c2ccb33424242f5eeeb74eb8c"}`
- **THEN** the response SHALL be `{source:"bili", videoId:"BV1y2q6YWEGp", page:1, title, thumb?, duration?}` and SHALL NOT contain `spm_id_from`, `vd_source`, `share_source`, `from_spmid`, `is_story_h5`, or any field whose value is the original URL

#### Scenario: YouTube watch URL with tracking params

- **WHEN** `/api/parse-link` receives `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=ABC&pp=XYZ&t=42s"}`
- **THEN** the response SHALL be `{source:"yt", videoId:"dQw4w9WgXcQ", title, thumb}` and SHALL NOT include `si`, `pp`, `t`, or any other input-side query value

### Requirement: Accept already-canonical refs without re-fetching

The parser surface SHALL accept an alternate input shape `{ref:{source, videoId, page?}}` (in addition to the existing `{url}`). When `ref` is supplied, the parser SHALL skip URL extraction and redirect resolution entirely and SHALL only perform the metadata fetch step (oEmbed for YouTube, `api.bilibili.com/x/web-interface/view` for Bilibili). If the metadata fetch fails, the response SHALL still include `source`, `videoId`, and a synthetic title.

#### Scenario: Re-queue from a favorite ref

- **WHEN** the request body is `{"ref":{"source":"bili","videoId":"BV1y2q6YWEGp","page":1}}`
- **THEN** the parser SHALL NOT attempt URL extraction and SHALL only fetch metadata for that BV id

