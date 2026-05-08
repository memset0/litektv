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

### Requirement: Embed URL picks page-selector by UA and cid availability

The frontend's `embedUrl(song)` helper SHALL build Bilibili player iframe URLs whose page-selector parameter is chosen by branching on the runtime user-agent and on whether the song record carries `cid`. The branching mirrors what Bilibili's own `player.bilibili.com/player.html` inline JS does (UA test `/AppleWebKit.*Mobile.*/`), so the URL we emit is the one that the player we land on actually honors:

| UA       | Song has `cid`? | Selector emitted     |
|----------|-----------------|----------------------|
| Mobile   | yes or no       | `p=${page || 1}`     |
| Desktop  | yes             | `cid=${cid}`         |
| Desktop  | no              | `page=${page || 1}`  |

Rationale per branch:

- **Mobile**: `player.html` redirects to `www.bilibili.com/blackboard/webplayer/mbplayer.html`. The mobile player ignores `cid=` and selects the page from `p=N` only. So we emit `p=` regardless of cid availability.
- **Desktop with cid**: `player.html` honors `cid=N` reliably. cid is the most precise selector.
- **Desktop without cid (legacy queue rows)**: `page=N` is the historical verified-working fallback. `p=N` is unverified for desktop player.html, so we keep `page=N` for this path to preserve known-good behavior.

The Song record's `page` field SHALL be persisted on every Bilibili row regardless of whether `cid` is also persisted, so the `page=`-fallback path always has a value to fall back to. The `bvid` / `aid` parameter is unchanged.

#### Scenario: Mobile UA, song has cid

- **WHEN** `embedUrl({source:"bili", videoId:"BV1TN4y187xe", page:4, cid:1234567})` is called and `navigator.userAgent` matches `/AppleWebKit.*Mobile.*/`
- **THEN** the returned URL SHALL contain `bvid=BV1TN4y187xe` AND `p=4`
- **AND** the URL SHALL NOT contain `cid=` or `page=`

#### Scenario: Desktop UA, song has cid

- **WHEN** `embedUrl({source:"bili", videoId:"BV1TN4y187xe", page:4, cid:1234567})` is called and `navigator.userAgent` does NOT match `/AppleWebKit.*Mobile.*/`
- **THEN** the returned URL SHALL contain `bvid=BV1TN4y187xe` AND `cid=1234567`
- **AND** the URL SHALL NOT contain `p=` or `page=`

#### Scenario: Desktop UA, song lacks cid (legacy data)

- **WHEN** `embedUrl({source:"bili", videoId:"BV1TN4y187xe", page:4})` is called (no `cid`) on a desktop UA
- **THEN** the returned URL SHALL contain `bvid=BV1TN4y187xe` AND `page=4`
- **AND** the URL SHALL NOT contain `cid=` or `p=`

#### Scenario: Mobile UA, song lacks cid (legacy data)

- **WHEN** `embedUrl({source:"bili", videoId:"BV1TN4y187xe", page:4})` is called (no `cid`) on a mobile UA
- **THEN** the returned URL SHALL contain `bvid=BV1TN4y187xe` AND `p=4`
- **AND** the URL SHALL NOT contain `cid=` or `page=`

#### Scenario: Song has no page either

- **WHEN** `embedUrl({source:"bili", videoId:"BV1uv411q7Mv"})` is called (no `page`, no `cid`)
- **THEN** the returned URL SHALL contain `bvid=BV1uv411q7Mv` AND a page-selector defaulting to value `1` (`p=1` on mobile, `page=1` on desktop)

