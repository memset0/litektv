## ADDED Requirements

### Requirement: Bilibili favorite rows carry the per-page cid

The favorites table SHALL persist an optional `cid: number | null` column for Bilibili rows. When set, `cid` is the per-page content ID returned by `api.bilibili.com/x/web-interface/view`'s `pages[].cid` for the row's `(videoId, page)` pair. The column SHALL be additive (existing rows that pre-date the column carry `cid: null`); a fresh `INSERT … ON CONFLICT DO NOTHING` SHALL fill `cid` for new rows whose payload supplies it. YouTube favorites SHALL leave `cid` null. The `(source, videoId, page)` PK is unchanged — `cid` is metadata, not a key.

#### Scenario: New Bilibili favorite carries cid in its insert

- **WHEN** a `{type:"favorite.add", song:{source:"bili", videoId:"BV…", page:4, cid:1375775815, …}}` reaches the backend and creates a new row
- **THEN** the resulting favorites row SHALL have `cid = 1375775815`

#### Scenario: Re-add an existing favorite (no-op)

- **WHEN** a `favorite.add` arrives for a `(source, videoId, page)` triple that already has a row
- **THEN** the existing row's `cid` value SHALL be preserved (first-starrer wins applies to cid the same as it does to title / thumb / addedBy)

#### Scenario: YouTube favorite has null cid

- **WHEN** a YouTube `favorite.add` row is created
- **THEN** the favorites row's `cid` value SHALL be `null`

### Requirement: Favorite snapshot broadcasts cid

The `{type:"favorites", favorites:[…]}` snapshot the server broadcasts (on hello, after every `favorite.add` / `favorite.update` / `favorite.remove`) SHALL include each row's `cid` field. When a row's stored `cid` is `null`, the wire field SHALL be `undefined` (i.e. omitted) so the JSON stays compact and frontends can use a simple `if (fav.cid)` check.

#### Scenario: Catalog modal receives cid for Bilibili rows

- **WHEN** the catalog modal renders favorites after a fresh `favorites` snapshot
- **THEN** every Bilibili row that has a stored `cid` SHALL surface it on the in-memory `Favorite` object

### Requirement: Catalog `add to queue` ships cid in the ref

The frontend's catalog modal SHALL include `cid` (when known) in the `{type:"queue.add", ref:{source, videoId, page, cid}}` payload. The backend's `queue.add` handler SHALL prefer the supplied cid over re-fetching it via `parseRef`. When the favorite has no `cid` (e.g. a row added before this change is shipped and not yet backfilled), the existing fallback path (parseRef on Bilibili refs missing cid) SHALL still fire so the queued song still gets a cid where possible.

#### Scenario: Catalog re-add hits zero upstream calls when cid is cached

- **WHEN** the user clicks `+` on a Bilibili catalog row whose stored favorite has `cid` set
- **THEN** the resulting `queue.add` ref payload SHALL include that cid
- **AND** the backend SHALL NOT call `api.bilibili.com/x/web-interface/view` for that add (the favorite's cached title / thumb / duration / cid are sufficient)

#### Scenario: Catalog re-add for a legacy row without cid

- **WHEN** the user clicks `+` on a Bilibili catalog row whose stored favorite has no `cid`
- **THEN** the backend's `queue.add` ref handler SHALL re-parse via `parseRef` to fetch cid (the existing fallback)
- **AND** the queued song SHALL receive cid if the upstream call succeeds, or undefined cid if it fails (graceful — see link-parser)
