# Link Parser

## Purpose

Translate user-pasted URLs (and messy share text) into normalized song metadata. Frontend MUST delegate parsing to the backend; client-side regex is only a degraded fallback when the backend is unreachable.

## Requirements

### Requirement: REST endpoint for parsing

The backend SHALL expose `POST /api/parse-link` accepting `{url: string, userId?: string}` (`url` is treated as raw text up to 2048 chars; the parser extracts the URL itself) and SHALL return `{source, videoId, page?, title, thumb?, duration?}`.

#### Scenario: Direct YouTube URL

- **WHEN** the request body is `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`
- **THEN** the response SHALL be `{source:"yt", videoId:"dQw4w9WgXcQ", title, thumb}` with title fetched via oEmbed and a `hqdefault.jpg` thumbnail

#### Scenario: Direct Bilibili BV URL

- **WHEN** the request body is `{"url":"https://www.bilibili.com/video/BV1uv411q7Mv"}`
- **THEN** the response SHALL include `source:"bili"`, `videoId:"BV1uv411q7Mv"`, and the title/pic/duration returned by `api.bilibili.com/x/web-interface/view`

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
