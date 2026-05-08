## ADDED Requirements

### Requirement: Per-connection auth state and owner key

Each WebSocket connection SHALL track an `ownerKey` derived from its current auth state: `acct:<account_id>` if a session is attached, otherwise `anon:<userId>`. The server SHALL recompute `ownerKey` whenever `auth.attach`, `auth.login`, or `auth.logout` succeeds, and SHALL emit a fresh `{type:"favorites", favorites}` message to that connection on every `ownerKey` change.

#### Scenario: Login mid-session updates owner key

- **WHEN** a connection that started with `ownerKey="anon:u_abc"` successfully sends `auth.login` for account `Memo`
- **THEN** the connection's `ownerKey` SHALL become `acct:<Memo's account_id>` and the server SHALL send a `favorites` snapshot reflecting the merged account list

### Requirement: Favorites messages

The server SHALL accept `favorite.add`, `favorite.remove`, and (optionally) `favorite.list` from any connected client. After any successful favorite mutation, the server SHALL broadcast `{type:"favorites", favorites:Favorite[]}` to every WebSocket whose current `ownerKey` matches the mutating connection's `ownerKey` (i.e. all of that user's active sessions). Favorites SHALL NOT be included in any `state` message and SHALL NOT be visible to other users in the same room.

#### Scenario: Two tabs of the same anonymous user

- **WHEN** an anonymous user has two tabs open (both connected with `userId="u_abc"`) and tab A sends `favorite.add`
- **THEN** both tabs SHALL receive a fresh `favorites` snapshot containing the new entry, and no other user in the room SHALL receive anything

#### Scenario: Favorites are not part of state

- **WHEN** any client receives a `state` message for the room
- **THEN** the message body SHALL NOT contain a `favorites` field

### Requirement: Auth messages

The server SHALL accept the following auth messages on the WebSocket: `auth.signup`, `auth.login`, `auth.attach` (with a previously-issued token), `auth.logout`, `auth.profile`. On success the server SHALL respond directly to the requesting connection with `{type:"auth.ok", token?, account:{id, name, emoji}}` (token omitted on logout / profile updates that don't issue a new token). Auth messages SHALL NOT mutate `RoomState` and SHALL NOT broadcast to peers.

#### Scenario: Other peers see only the presence-name update

- **WHEN** a logged-in user changes their `emoji` via `auth.profile`
- **THEN** the server SHALL update that user's presence row's `emoji` and broadcast a normal `state` snapshot, but SHALL NOT broadcast the auth response itself

### Requirement: Per-user rate limits include favorites and auth

Token-bucket rate limits SHALL include:

- `queue.add`: 30/min (existing)
- `danmaku`: 60/min (existing)
- link parsing: 20/min (existing)
- `favorite.add` + `favorite.remove`: combined 60/min per `ownerKey`
- `auth.login` + `auth.signup`: 10/min per IP and 5/min per name

Limits SHALL be keyed by `ownerKey` for favorites and by `(name, IP)` for auth so a logged-out client can't exhaust an account's budget for it.

#### Scenario: Favorite spam from one tab

- **WHEN** a connection sends `favorite.add` 70 times in 60 seconds
- **THEN** after the 60th the server SHALL respond with `{type:"error", error:"rate limited (favorite)"}` and SHALL NOT mutate state

## MODIFIED Requirements

### Requirement: Mutations are server-authoritative

All queue/track/profile/danmaku/favorite/auth mutations SHALL go through the WebSocket as typed messages. For room-scoped mutations (queue, track, profile, danmaku) the server applies them, increments `state.rev`, and re-broadcasts the full `RoomState` to every subscriber of that room. For per-user mutations (favorites, auth) the server applies them and only delivers messages to the matching `ownerKey` (favorites) or the originating connection (auth).

#### Scenario: Queue add propagates to all peers

- **WHEN** client A sends `{type:"queue.add", song}` and the room already has a `current`
- **THEN** the server SHALL append the song to the queue, bump `rev`, and every connected client SHALL receive the new state

#### Scenario: Track advance moves head to current and current to history

- **WHEN** any client sends `{type:"track.next"}`
- **THEN** the server SHALL push the current track (with `finishedAt`) into history and shift the queue head into current

#### Scenario: Favorite add does not affect room state

- **WHEN** client A sends `{type:"favorite.add", song}`
- **THEN** the server SHALL persist the favorite under client A's `ownerKey`, deliver a `favorites` snapshot only to A's `ownerKey` connections, and SHALL NOT bump `state.rev` or broadcast a `state` message
