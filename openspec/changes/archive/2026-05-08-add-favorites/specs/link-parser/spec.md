## ADDED Requirements

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

## MODIFIED Requirements

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
