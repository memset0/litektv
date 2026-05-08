## ADDED Requirements

### Requirement: Favorites snapshot on hello

On every successful `hello`, the server SHALL send the connecting client a `{type:"favorites", favorites:Favorite[]}` message containing the global favorites list ordered by `added_at` descending. There is no per-user filtering — every client gets the same list.

#### Scenario: Hello delivers the global favorites list

- **WHEN** a client sends `{type:"hello", userId:"u_abc", ...}`
- **THEN** the server SHALL deliver, in addition to the `state` snapshot, a `favorites` snapshot reflecting every favorite in the database

### Requirement: Favorites messages

The server SHALL accept `favorite.add`, `favorite.remove`, and `favorite.list` from any connected client. After any successful favorite mutation, the server SHALL broadcast `{type:"favorites", favorites:Favorite[]}` to **every** connected WebSocket regardless of room. Favorites SHALL NOT be included in any `state` message.

#### Scenario: Mutation broadcasts site-wide

- **WHEN** any client sends `favorite.add` and the row is inserted
- **THEN** every connected client (in the same room or any other room) SHALL receive a fresh `favorites` snapshot containing the new entry

#### Scenario: Favorites are not part of state

- **WHEN** any client receives a `state` message for the room
- **THEN** the message body SHALL NOT contain a `favorites` field

### Requirement: Favorites rate limit

A token-bucket rate limit SHALL apply to `favorite.add` + `favorite.remove` combined, at 60/min per `userId`.

#### Scenario: Favorite spam from one tab

- **WHEN** a connection sends `favorite.add` 70 times in 60 seconds
- **THEN** after the 60th the server SHALL respond with `{type:"error", error:"rate limited (favorite)"}` and SHALL NOT mutate state

## MODIFIED Requirements

### Requirement: Mutations are server-authoritative

All queue/track/profile/danmaku/favorite mutations SHALL go through the WebSocket as typed messages. For room-scoped mutations (queue, track, profile, danmaku) the server applies them, increments `state.rev`, and re-broadcasts the full `RoomState` to every subscriber of that room. For favorites the server applies them and broadcasts a fresh `favorites` snapshot to every connected client site-wide.

#### Scenario: Queue add propagates to all peers

- **WHEN** client A sends `{type:"queue.add", song}` and the room already has a `current`
- **THEN** the server SHALL append the song to the queue, bump `rev`, and every connected client in that room SHALL receive the new state

#### Scenario: Track advance moves head to current and current to history

- **WHEN** any client sends `{type:"track.next"}`
- **THEN** the server SHALL push the current track (with `finishedAt`) into history and shift the queue head into current

#### Scenario: Favorite add does not affect room state

- **WHEN** client A sends `{type:"favorite.add", song}`
- **THEN** the server SHALL persist the favorite, broadcast a `favorites` snapshot to every connected client, and SHALL NOT bump `state.rev` or broadcast any `state` message
