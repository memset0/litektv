## ADDED Requirements

### Requirement: Per-user favorites list, scoped by owner key

The backend SHALL maintain a favorites set per **owner key**. The owner key SHALL be `acct:<account_id>` when the connection has an authenticated session attached, and `anon:<userId>` otherwise (where `userId` is the stable `localStorage` UUID the client already sends in `hello`). Favorites SHALL NOT be embedded in `RoomState` and SHALL NOT be broadcast to peers in a room.

#### Scenario: Anonymous user stars a song from one room and sees it in another

- **WHEN** an anonymous user (no session) with `userId="u_abc"` connects in room `aaa` and sends `{type:"favorite.add", song:{source:"bili", videoId:"BV1y2q6YWEGp"}}`, then later disconnects and connects to room `bbb` with the same `userId`
- **THEN** on the connection to `bbb` the server SHALL include `BV1y2q6YWEGp` in the `favorites` snapshot delivered to that user, and SHALL NOT include it in any state snapshot delivered to other users in either room

#### Scenario: Logged-in user sees the same list across devices

- **WHEN** the same account is logged in on two devices and one device sends `favorite.add` for a new song
- **THEN** the server SHALL persist the favorite under `acct:<account_id>` and the other device's next `favorites` snapshot (on reconnect or live broadcast) SHALL include it

### Requirement: Favorites identity key is `(source, videoId, page)`

Each favorite SHALL be keyed by `(owner_key, source, videoId, page)` where `page` is `0` for entries with no Bilibili `?p=` (i.e. all YouTube favorites and Bilibili favorites without an explicit page). Re-adding an already-favorited song SHALL be idempotent and SHALL NOT change `added_at`.

#### Scenario: Re-adding the same song is a no-op

- **WHEN** a user sends `favorite.add` twice for `{source:"bili", videoId:"BV1y2q6YWEGp"}`
- **THEN** the favorites table SHALL contain exactly one row for `(owner_key, "bili", "BV1y2q6YWEGp", 0)` and the original `added_at` SHALL be preserved

#### Scenario: Bilibili p=2 and p=3 are different favorites

- **WHEN** a user sends `favorite.add` for the same Bilibili `videoId` once with `page:2` and once with `page:3`
- **THEN** the table SHALL contain two distinct rows and the catalog list SHALL show both

### Requirement: Favorites store only canonical fields

A favorite row SHALL contain `source`, `videoId`, `page` (0 when absent), `title`, optional `thumb`, optional `duration`, and `added_at`. It SHALL NOT contain the original raw URL, query parameters, referrers, or any other fields from the share string. The server SHALL reject any `favorite.add` payload that includes a non-allowlisted field with a `{type:"error", error:"unknown field"}` response and SHALL NOT mutate state.

#### Scenario: Bilibili share URL with tracking params

- **WHEN** a client posts a song originally pasted as `https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=...`
- **THEN** the favorite row SHALL store only `source="bili"`, `videoId="BV1y2q6YWEGp"`, `page=0`, plus `title`/`thumb`/`duration` from the parser, and the row SHALL NOT contain `spm_id_from`, `vd_source`, or any other query param

### Requirement: Favorites add and remove over WebSocket

The backend SHALL accept `{type:"favorite.add", song:{source, videoId, page?, title?, thumb?, duration?}}` and `{type:"favorite.remove", source, videoId, page?}` from any connected client. After a successful mutation the server SHALL send a `{type:"favorites", favorites:Favorite[]}` message to every WebSocket whose owner_key matches.

#### Scenario: Remove the only favorite

- **WHEN** a user has exactly one favorite and sends `favorite.remove` with its identity
- **THEN** the server SHALL delete the row and send `{type:"favorites", favorites:[]}` to that user's connections

#### Scenario: Add without metadata triggers a parser fetch

- **WHEN** a `favorite.add` arrives with `{source, videoId}` but no `title`
- **THEN** the server SHALL fetch metadata via the same path used by `/api/parse-link` and store the resulting `title`/`thumb`/`duration`; if metadata fetch fails the server SHALL still persist with a synthetic title (e.g. `"Bilibili BV..."`)

### Requirement: Re-queueing from favorites does not re-parse

The backend SHALL accept a queue add of the form `{type:"queue.add", ref:{source, videoId, page?}}` where `ref` is a favorite identity. When `ref` is supplied, the server SHALL skip URL parsing entirely and look up cached metadata from the favorites row first, falling back to the parser's metadata fetch only if no cached title is available.

#### Scenario: Add favorite to queue from catalog modal

- **WHEN** the user clicks "add to queue" on a row in the catalog modal
- **THEN** the client SHALL send `{type:"queue.add", ref:{source, videoId, page}}` and the server SHALL append a Song with the favorite's cached title to the queue without performing a network parse

### Requirement: Favorites snapshot on connect

On every successful `hello` (and on every successful `auth.login` / `auth.logout`), the server SHALL send the connecting client a `{type:"favorites", favorites:Favorite[]}` message reflecting the favorites for the resulting owner key, ordered by `added_at` descending.

#### Scenario: Reconnect delivers favorites alongside room state

- **WHEN** a client reconnects to a room
- **THEN** the server SHALL send a `state` snapshot for room state AND a `favorites` snapshot for the user's owner key

### Requirement: Catalog search supports pinyin, initials, and substring

The catalog modal SHALL match a query string against each favorite's title using three indexes computed client-side: full pinyin (Chinese characters expanded with no separators, lowercase), pinyin initials (first letter of each character's pinyin, lowercase), and the lowercase original title. A favorite SHALL match if the lowercase query is a contiguous substring of any of the three indexes.

#### Scenario: User types "xzgn" and matches 小镇姑娘

- **WHEN** a favorite has title `小镇姑娘` and the search box contains `xzgn`
- **THEN** the row SHALL be visible in the filtered list

#### Scenario: User types "xiaozhen" and matches 小镇姑娘

- **WHEN** a favorite has title `小镇姑娘` and the search box contains `xiaozhen`
- **THEN** the row SHALL be visible in the filtered list

#### Scenario: User types "Rick" and matches an English title

- **WHEN** a favorite has title `Never Gonna Give You Up` and the search box contains `gonna`
- **THEN** the row SHALL be visible (case-insensitive substring match on the original title)

#### Scenario: Empty query shows all favorites

- **WHEN** the search box is empty
- **THEN** every favorite row SHALL be visible, ordered by `added_at` descending

### Requirement: Star toggle on queue and history rows

Every queue row and every history row SHALL render a star toggle. Clicking it SHALL send `favorite.add` (if not yet starred for the current owner key) or `favorite.remove` (if starred). The toggle's filled/empty state SHALL reflect the current `favorites` snapshot, not the room state.

#### Scenario: Starring a history entry

- **WHEN** the user clicks the star on a row in the history list
- **THEN** the client SHALL send `{type:"favorite.add", song:{source, videoId, page?, title, thumb?}}` using the row's existing fields, and the star icon SHALL switch to its filled variant once the resulting `favorites` snapshot arrives
