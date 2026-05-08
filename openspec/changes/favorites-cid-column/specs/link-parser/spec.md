## ADDED Requirements

### Requirement: cid extraction failure is non-fatal

When the upstream `api.bilibili.com/x/web-interface/view` call fails, returns a non-zero `code`, or returns a payload without a usable `cid`, the parser SHALL NOT crash. `fetchBilibiliMeta` SHALL return `{}` (or omit `cid` from its return value) on every error path, and `finalizeMeta` SHALL produce a `ParsedSongMeta` with `cid: undefined` rather than throwing. Callers downstream (`queue.add` handler, `favorite.add` handler, frontend `embedUrl`) SHALL treat missing `cid` as a normal case and use the `p` / `page` fallback path.

#### Scenario: Upstream Bilibili API returns 5xx

- **WHEN** `parseLink` is invoked for a Bilibili URL and `/x/web-interface/view` returns HTTP 503
- **THEN** the response from `POST /api/parse-link` SHALL still be `{source:"bili", videoId, page, title:"<fallback>", thumb, duration:undefined}` (no `cid` field, no error thrown)
- **AND** the WS `queue.add` succeeds (the song is queued without cid)

#### Scenario: Upstream returns code !== 0

- **WHEN** the upstream `/x/web-interface/view` returns `{code: -404, …}` (e.g. video deleted)
- **THEN** `cid` SHALL be undefined in the parsed metadata
- **AND** no exception SHALL propagate to the caller

#### Scenario: Frontend embedUrl with undefined cid

- **WHEN** `embedUrl` is called for a Bilibili song whose `cid` is undefined
- **THEN** the returned URL SHALL fall back to `p=N` (mobile UA) or `page=N` (desktop UA) per the existing UA-aware selector — no exception, no console warning, just the legacy path
