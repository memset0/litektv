## ADDED Requirements

### Requirement: Favorites are a single global, site-wide list

The backend SHALL maintain ONE favorites set, shared by every visitor of the site. Stars added by any user are visible to every other user. The favorites set SHALL NOT be embedded in `RoomState` (it does not belong to any single room) and SHALL NOT be scoped per-user, per-room, or per-account.

#### Scenario: User A stars in room aaa, user B sees it in room bbb

- **WHEN** user A in room `aaa` sends `{type:"favorite.add", song:{source:"bili", videoId:"BV1y2q6YWEGp"}}`, and user B is connected in room `bbb`
- **THEN** B SHALL receive a `{type:"favorites", favorites:[...]}` message that includes that entry, even though A and B are in different rooms

#### Scenario: Reconnect delivers the global list

- **WHEN** any client (re)connects via `hello`
- **THEN** the server SHALL deliver a `favorites` snapshot containing every favorite in the database, ordered by `added_at` descending

### Requirement: Favorites identity key is `(source, videoId, page)`

Each favorite SHALL be keyed globally by `(source, videoId, page)` where `page` is `0` for entries with no Bilibili `?p=` (i.e. all YouTube favorites and Bilibili favorites without an explicit page). Re-adding an already-favorited song SHALL be idempotent: the existing row's `title`, `thumb`, `duration`, `addedBy`, and `added_at` SHALL be preserved (first-starrer wins).

#### Scenario: Re-adding the same song is a no-op

- **WHEN** Alice sends `favorite.add` for `{source:"bili", videoId:"BV1y2q6YWEGp"}`, then Bob sends the same `favorite.add`
- **THEN** the favorites table SHALL contain exactly one row for `("bili", "BV1y2q6YWEGp", 0)`, and that row's `addedBy` SHALL still be Alice and its `addedAt` SHALL still be Alice's timestamp

#### Scenario: Bilibili p=2 and p=3 are separate favorites

- **WHEN** users send `favorite.add` for the same Bilibili `videoId` once with `page:2` and once with `page:3`
- **THEN** the table SHALL contain two distinct rows and the catalog list SHALL show both

### Requirement: Each favorite row records its first starrer

Each row SHALL include `addedBy = {id, name, emoji}` taken from the server-side presence of the user who triggered the first successful `favorite.add` for that key. The frontend SHALL NOT be allowed to set `addedBy` directly — the server stamps it from the connection's known identity so a client can't spoof someone else.

#### Scenario: addedBy reflects the favoriter, not the original queuer

- **WHEN** a song appears in `room.history` with `addedBy.name == "Alice"` (because Alice originally queued it), and Bob clicks the star on that history row
- **THEN** the resulting favorite row SHALL have `addedBy.name == "Bob"` (the favoriter), not Alice

### Requirement: Favorites store only canonical fields

A favorite row SHALL contain `source`, `videoId`, `page` (0 when absent), `title`, optional `thumb`, optional `duration`, `addedBy`, and `added_at`. It SHALL NOT contain the original raw URL, query parameters, referrers, or any other fields from the share string. The server SHALL reject any `favorite.add` payload that includes a non-allowlisted field with a `{type:"error", error:"unknown field"}` response and SHALL NOT mutate state.

#### Scenario: Bilibili share URL with tracking params

- **WHEN** a client posts a song originally pasted as `https://www.bilibili.com/video/BV1y2q6YWEGp/?spm_id_from=..search-card.all.click&vd_source=...`
- **THEN** the favorite row SHALL store only `source="bili"`, `videoId="BV1y2q6YWEGp"`, `page=0`, plus `title`/`thumb`/`duration` from the parser and `addedBy` from presence — and SHALL NOT contain `spm_id_from`, `vd_source`, or any other query param

### Requirement: Favorites are add-only over WebSocket

The backend SHALL accept `{type:"favorite.add", song:{source, videoId, page?, title?, thumb?, duration?}}` from any connected client. There SHALL be NO `favorite.remove` message in v1; an unrecognized `type:"favorite.remove"` (or any other unknown type) SHALL be rejected with `{type:"error", error:"bad message"}`. After a successful add the server SHALL broadcast `{type:"favorites", favorites:Favorite[]}` to **every** connected client (regardless of room), reflecting the entire updated global list.

#### Scenario: favorite.remove is not a recognized message

- **WHEN** any client sends `{type:"favorite.remove", source, videoId, page}`
- **THEN** the server SHALL respond with `{type:"error", error:"bad message"}` and SHALL NOT mutate state

#### Scenario: Add without metadata triggers a parser fetch

- **WHEN** a `favorite.add` arrives with `{source, videoId}` but no `title`
- **THEN** the server SHALL fetch metadata via the same path used by `/api/parse-link` and store the resulting `title`/`thumb`/`duration`; if metadata fetch fails the server SHALL still persist with a synthetic title (e.g. `"Bilibili BV..."`)

### Requirement: Re-queueing from favorites stamps the current user

The backend SHALL accept a queue add of the form `{type:"queue.add", ref:{source, videoId, page?}}` where `ref` is a favorite identity. When `ref` is supplied, the server SHALL skip URL parsing entirely and look up cached metadata from the favorites row first, falling back to the parser's metadata fetch only if no cached title is available. The resulting `Song.addedBy` SHALL be the current connection's user (from presence), NOT the favorite's `addedBy`.

#### Scenario: Bob re-queues a song Alice favorited

- **WHEN** Alice starred a song (the favorite row carries `addedBy.name == "Alice"`) and Bob clicks "+ 加入" on that row in the catalog modal
- **THEN** the new queue entry's `addedBy.name` SHALL be `"Bob"`, not `"Alice"`

### Requirement: Favorites snapshot on connect

On every successful `hello`, the server SHALL send the connecting client a `{type:"favorites", favorites:Favorite[]}` message reflecting the global favorites list, ordered by `added_at` descending.

#### Scenario: Reconnect delivers the latest list

- **WHEN** a client reconnects to a room
- **THEN** the server SHALL send a `state` snapshot for room state AND a `favorites` snapshot containing the global list

### Requirement: Catalog search supports pinyin, initials, and substring

The catalog modal SHALL match a query string against each favorite's title using three indexes computed client-side: full pinyin (Chinese characters expanded with no separators, lowercase), pinyin initials (first letter of each character's pinyin, lowercase), and the lowercase original title. A favorite SHALL match if the lowercase query is a contiguous substring of any of the three indexes.

#### Scenario: User types "xzgn" and matches 小镇姑娘

- **WHEN** a favorite has title `小镇姑娘` and the search box contains `xzgn`
- **THEN** the row SHALL be visible in the filtered list

#### Scenario: User types "xiaozhen" and matches 小镇姑娘

- **WHEN** a favorite has title `小镇姑娘` and the search box contains `xiaozhen`
- **THEN** the row SHALL be visible in the filtered list

#### Scenario: User types "gonna" and matches an English title

- **WHEN** a favorite has title `Never Gonna Give You Up` and the search box contains `gonna`
- **THEN** the row SHALL be visible (case-insensitive substring match on the original title)

#### Scenario: Empty query shows all favorites

- **WHEN** the search box is empty
- **THEN** every favorite row SHALL be visible, ordered by `added_at` descending

### Requirement: Star button on queue and history rows is add-only

Every queue row and every history row SHALL render a star button. The button's filled/empty state SHALL reflect the current global `favorites` snapshot — which is shared, so all users see the same star state for the same song.

When the row is NOT yet in the favorites set, clicking the button SHALL send `{type:"favorite.add", song:{...}}` derived from the row's fields. When the row IS already in the favorites set, the button SHALL be `disabled` (no click handler, no further request) with a tooltip indicating the song is already saved (e.g. `已收藏`).

#### Scenario: Starring a history entry

- **WHEN** the user clicks the star on a row in the history list and that song is not yet in the favorites set
- **THEN** the client SHALL send `{type:"favorite.add", song:{source, videoId, page?, title, thumb?}}` using the row's existing fields, and the star icon SHALL switch to its filled variant once the resulting `favorites` snapshot arrives

#### Scenario: Clicking an already-filled star is a no-op

- **WHEN** the user clicks a star button on a row whose `(source, videoId, page)` is already in the favorites set
- **THEN** the client SHALL NOT send any WebSocket message and the favorites set SHALL be unchanged

#### Scenario: A's star fills B's queue row in real time

- **WHEN** user A stars a song that's also in user B's queue rendering
- **THEN** B's queue row SHALL transition the star icon to filled (and disabled) on the next favorites broadcast, without B needing to refresh
