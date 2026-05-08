## ADDED Requirements

### Requirement: Per-connection owner key

Each WebSocket connection SHALL track an `ownerKey` of the form `anon:<userId>`, derived from the `userId` in the connection's `hello`. The server SHALL emit a `{type:"favorites", favorites}` message to that connection whenever the `ownerKey` is established (i.e. on every successful `hello`).

#### Scenario: Hello establishes the owner key

- **WHEN** a client sends `{type:"hello", userId:"u_abc", ...}`
- **THEN** the connection's `ownerKey` SHALL become `anon:u_abc` and the server SHALL deliver a `favorites` snapshot reflecting that key

### Requirement: Favorites messages

The server SHALL accept `favorite.add`, `favorite.remove`, and (optionally) `favorite.list` from any connected client. After any successful favorite mutation, the server SHALL broadcast `{type:"favorites", favorites:Favorite[]}` to every WebSocket whose current `ownerKey` matches the mutating connection's `ownerKey` (i.e. all tabs of that user). Favorites SHALL NOT be included in any `state` message and SHALL NOT be visible to other users in the same room.

#### Scenario: Two tabs of the same userId

- **WHEN** a user has two tabs open (both connected with `userId="u_abc"`) and tab A sends `favorite.add`
- **THEN** both tabs SHALL receive a fresh `favorites` snapshot containing the new entry, and no other user in the room SHALL receive anything

#### Scenario: Favorites are not part of state

- **WHEN** any client receives a `state` message for the room
- **THEN** the message body SHALL NOT contain a `favorites` field

### Requirement: Favorites rate limit

A token-bucket rate limit SHALL apply to `favorite.add` + `favorite.remove` combined, at 60/min per `ownerKey`.

#### Scenario: Favorite spam from one tab

- **WHEN** a connection sends `favorite.add` 70 times in 60 seconds
- **THEN** after the 60th the server SHALL respond with `{type:"error", error:"rate limited (favorite)"}` and SHALL NOT mutate state

## MODIFIED Requirements

### Requirement: Mutations are server-authoritative

All queue/track/profile/danmaku/favorite mutations SHALL go through the WebSocket as typed messages. For room-scoped mutations (queue, track, profile, danmaku) the server applies them, increments `state.rev`, and re-broadcasts the full `RoomState` to every subscriber of that room. For favorites the server applies them and only delivers `favorites` snapshots to the matching `ownerKey`.

#### Scenario: Queue add propagates to all peers

- **WHEN** client A sends `{type:"queue.add", song}` and the room already has a `current`
- **THEN** the server SHALL append the song to the queue, bump `rev`, and every connected client SHALL receive the new state

#### Scenario: Track advance moves head to current and current to history

- **WHEN** any client sends `{type:"track.next"}`
- **THEN** the server SHALL push the current track (with `finishedAt`) into history and shift the queue head into current

#### Scenario: Favorite add does not affect room state

- **WHEN** client A sends `{type:"favorite.add", song}`
- **THEN** the server SHALL persist the favorite under client A's `ownerKey`, deliver a `favorites` snapshot only to A's `ownerKey` connections, and SHALL NOT bump `state.rev` or broadcast a `state` message
