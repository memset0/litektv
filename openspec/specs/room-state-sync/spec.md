# Room State Sync

## Purpose

The backend is the single authoritative source of room state. Every connected client mirrors it via WebSocket; nothing is cached client-side as the source of truth. Each room has a queue, current track, history, danmaku ring, and presence map.
## Requirements
### Requirement: WebSocket endpoint per room

The backend SHALL expose a WebSocket endpoint at `/ws?room=<slug>` that accepts a stable `userId` from each client and treats the server-side `RoomState` as canonical.

#### Scenario: Client connects, sends hello, receives state

- **WHEN** a client opens `wss://<host>/ws?room=<slug>` and sends `{type:"hello", userId, name, emoji, anonymous}`
- **THEN** the server SHALL register the user in `room.users[userId]` and immediately send a full `{type:"state", state:RoomState}` snapshot

#### Scenario: Reconnect resumes the same identity

- **WHEN** a client reconnects with the same `userId`
- **THEN** the server SHALL keep the user's prior presence row and broadcast a fresh `state` snapshot

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

### Requirement: No playback synchronization

The server SHALL NOT track or sync playback position, play/pause state, or volume. Each client plays independently.

#### Scenario: Server ignores playback fields

- **WHEN** a client sends a message containing playback position
- **THEN** the server SHALL discard that field and not broadcast it

### Requirement: Presence with 60s online window

Users are considered online if their `lastSeen` is within the last 60 seconds. Clients SHALL send `{type:"heartbeat"}` periodically (≤30s). Stale presence rows SHALL be pruned on the next mutation.

#### Scenario: Idle user falls offline

- **WHEN** a user has not sent any message in 60s
- **THEN** the user's row remains in `users` but appears offline in any presence-aware UI; the next mutation in the room SHALL prune it

### Requirement: Danmaku ring buffer of 50

The backend SHALL keep at most the last 50 danmaku messages per room.

#### Scenario: Older messages drop

- **WHEN** a 51st `{type:"danmaku", text}` arrives
- **THEN** the oldest message SHALL be discarded and `state.danmaku.length` SHALL stay at 50

### Requirement: Per-user rate limits

The backend SHALL apply token-bucket rate limits keyed by `userId`:

- `queue.add`: 30/min
- `danmaku`: 60/min
- link parsing: 20/min

#### Scenario: Limit exceeded returns an error message, not state

- **WHEN** a client exceeds a limit
- **THEN** the server SHALL respond with `{type:"error", error:"rate limited (...)"}` and SHALL NOT mutate state

### Requirement: Favorites snapshot on hello

On every successful `hello`, the server SHALL send the connecting client a `{type:"favorites", favorites:Favorite[]}` message containing the global favorites list ordered by `added_at` descending. There is no per-user filtering — every client gets the same list.

#### Scenario: Hello delivers the global favorites list

- **WHEN** a client sends `{type:"hello", userId:"u_abc", ...}`
- **THEN** the server SHALL deliver, in addition to the `state` snapshot, a `favorites` snapshot reflecting every favorite in the database

### Requirement: Favorites messages

The server SHALL accept `favorite.add` and `favorite.list` from any connected client. There SHALL be NO `favorite.remove` message in v1 — sending it SHALL be rejected with `{type:"error", error:"bad message"}` and SHALL NOT mutate state. After any successful favorite mutation, the server SHALL broadcast `{type:"favorites", favorites:Favorite[]}` to **every** connected WebSocket regardless of room. Favorites SHALL NOT be included in any `state` message.

#### Scenario: Mutation broadcasts site-wide

- **WHEN** any client sends `favorite.add` and the row is inserted
- **THEN** every connected client (in the same room or any other room) SHALL receive a fresh `favorites` snapshot containing the new entry

#### Scenario: Favorites are not part of state

- **WHEN** any client receives a `state` message for the room
- **THEN** the message body SHALL NOT contain a `favorites` field

### Requirement: Favorites rate limit

A token-bucket rate limit SHALL apply to `favorite.add`, at 60/min per `userId`.

#### Scenario: Favorite spam from one tab

- **WHEN** a connection sends `favorite.add` 70 times in 60 seconds
- **THEN** after the 60th the server SHALL respond with `{type:"error", error:"rate limited (favorite)"}` and SHALL NOT mutate state

