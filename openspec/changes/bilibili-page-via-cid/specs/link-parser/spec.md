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
